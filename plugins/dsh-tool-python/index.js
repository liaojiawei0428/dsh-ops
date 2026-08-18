/**
 * dsh-tool-python — model-facing Python 3 execution tool (host half only).
 *
 * Registers a `python` tool on `ctx.tools` that runs Python source through the
 * mounted `ctx.shell` executor: the code is written to a per-call temp script
 * and executed as `& <pythonPath> <script> <args...>`, so it inherits the
 * shell seam's complete contract — the per-session sandbox policy, deadlines,
 * output caps with spill files, and the `[exit code: N]` marker story.
 *
 * The plugin imports no workspace packages: every registry contract it uses
 * (ctx.tools.register, ctx.shell, ctx.systemPrompt, ctx.shellEnv) is reached
 * through injections, which keeps a linked install loadable without its own
 * node_modules.
 */

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'

/** Registry name of the tool this plugin registers. */
const TOOL_NAME = 'python'

/**
 * Environment pinned per call. Windows Python defaults redirected streams to
 * the OEM code page, which garbles non-ASCII output exactly like Windows
 * PowerShell 5.1 does; these statements force UTF-8 end to end.
 */
const UTF8_ENV_PREAMBLE = "$env:PYTHONUTF8='1'; $env:PYTHONIOENCODING='utf-8'; $env:PYTHONUNBUFFERED='1'; "

/**
 * Cancellation marker matching the registry's abort expectation without
 * importing dsh-llm: the loop recognizes an `AbortError`-named rejection as
 * caller cancellation rather than a tool failure.
 * @returns a rejection error for an aborted call.
 */
function abortError() {
  const error = new Error('tool call aborted')
  error.name = 'AbortError'
  return error
}

/** Quote one value as a PowerShell single-quoted literal (embedded quotes doubled).
 * @param value - the raw string.
 * @returns the quoted literal.
 */
function psSingleQuoted(value) {
  return `'${value.replace(/'/g, "''")}'`
}

/** Validate value constraints the parameter schema cannot express.
 * @param args - parsed model arguments.
 */
function validateArgs(args) {
  if (args.code.trim().length === 0) {
    throw new Error('invalid code: expected a non-empty string')
  }
  if (args.description.trim().length === 0) {
    throw new Error('invalid description: expected a non-empty string')
  }
  if (args.args !== undefined) {
    if (!Array.isArray(args.args) || args.args.some(item => typeof item !== 'string')) {
      throw new Error('invalid args: expected an array of strings')
    }
  }
  if (args.timeoutMs !== undefined && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
    throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`)
  }
}

/**
 * Resolve an explicit workdir first, making a relative one session-workspace-relative;
 * otherwise use the session header cwd and leave executor defaulting as the fallback.
 * @param modelWorkdir - the model-supplied workdir, when present.
 * @param exec - the tool execution carrying the calling agent.
 * @returns the resolved working directory, or undefined for executor defaulting.
 */
function resolveWorkdir(modelWorkdir, exec) {
  const headerCwd = exec.agent?.session.header.cwd
  if (modelWorkdir === undefined) return headerCwd
  if (headerCwd !== undefined && !isAbsolute(modelWorkdir)) {
    return resolvePath(headerCwd, modelWorkdir)
  }
  return modelWorkdir
}

/** Detach one executor output stream into the canonical plain-JSON shape.
 * @param stream - the executor's collected stream.
 * @returns plain JSON: text, truncated, and spillPath when present.
 */
function canonicalStream(stream) {
  return {
    text: stream.text,
    truncated: stream.truncated,
    ...stream.spillPath !== undefined ? { spillPath: stream.spillPath } : {},
  }
}

/** Detach the executor DTO into the canonical plain-JSON foreground result.
 * @param result - the completed foreground run from the executor.
 * @returns plain JSON matching the declared output schema.
 */
function canonicalResult(result) {
  return {
    kind: 'foreground',
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    aborted: result.aborted,
    timeoutMs: result.timeoutMs,
    stdout: canonicalStream(result.stdout),
    stderr: canonicalStream(result.stderr),
    ...result.sandbox !== undefined ? {
      sandbox: {
        mode: result.sandbox.mode,
        denied: result.sandbox.denied,
        ...result.sandbox.enforcement !== undefined ? { enforcement: result.sandbox.enforcement } : {},
        ...result.sandbox.runnerFailed !== undefined ? { runnerFailed: result.sandbox.runnerFailed } : {},
      },
    } : {},
  }
}

/** Append the truncation notice (with the full-output spill path) to a stream's text.
 * @param output - one collected stream of the settled run.
 * @returns the stream text plus its truncation notice when truncated.
 */
function streamText(output) {
  if (!output.truncated) return output.text
  return `${output.text}\n[output truncated; full output: ${output.spillPath ?? '(unavailable)'}]`
}

/**
 * Shape one finished run into the text the model sees, matching the shell
 * tools' rendering story: stdout, a marked stderr section, then interruption
 * and exit markers, each on its own line; a clean exit (0, no signal)
 * produces no marker. The exit marker stays last so `parseExitMarker` anchors
 * there, exactly like the pwsh tool's renderer.
 * @param result - the canonical foreground value.
 * @returns the model-facing text.
 */
function renderResult(result) {
  let body = streamText(result.stdout)
  const err = streamText(result.stderr)
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith('\n')) body += '\n'
    body += `[stderr]\n${err}`
  }
  if (body.length === 0) body = '(no output)'

  const markers = []
  if (result.sandbox?.denied) {
    markers.push(`[sandbox: file access denied under ${result.sandbox.mode} mode]`)
  }
  if (result.timedOut) markers.push(`[timed out after ${result.timeoutMs}ms]`)
  if (result.signal !== null) {
    markers.push(`[killed by signal: ${result.signal}]`)
  } else if (result.exitCode !== 0) {
    markers.push(`[exit code: ${result.exitCode}]`)
  }
  if (markers.length === 0) return body

  if (!body.endsWith('\n')) body += '\n'
  return body + markers.join('\n')
}

/**
 * Split the rendered text into the terminal card's body and exit pill. Anchors
 * on the LAST line only, mirroring `parseExitStatus` semantics; markers other
 * than the exit status stay part of the body.
 * @param text - the rendered result text.
 * @returns the body plus the terminal exit fields (`exitCode` or `signal`).
 */
function parseExitMarker(text) {
  const lines = text.split('\n')
  let last = lines.length - 1
  while (last >= 0 && lines[last].length === 0) last -= 1
  if (last < 0) return { body: text, exit: {} }
  const exitMatch = lines[last].match(/^\[exit code: (-?\d+)\]$/)
  if (exitMatch !== null) {
    lines.splice(last, 1)
    return { body: lines.join('\n').replace(/\n+$/, ''), exit: { exitCode: Number(exitMatch[1]) } }
  }
  const signalMatch = lines[last].match(/^\[killed by signal: (.+)\]$/)
  if (signalMatch !== null) {
    lines.splice(last, 1)
    return { body: lines.join('\n').replace(/\n+$/, ''), exit: { signal: signalMatch[1] } }
  }
  return { body: text, exit: {} }
}

/** One property-set of the canonical output stream schema. */
const STREAM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'truncated'],
  properties: {
    text: { type: 'string' },
    truncated: { type: 'boolean' },
    spillPath: { type: 'string' },
  },
}

/** The canonical foreground output schema (the registry's supported JSON Schema dialect). */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'exitCode', 'signal', 'timedOut', 'aborted', 'timeoutMs', 'stdout', 'stderr'],
  properties: {
    kind: { type: 'string', const: 'foreground' },
    exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
    signal: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    timedOut: { type: 'boolean' },
    aborted: { type: 'boolean' },
    timeoutMs: { type: 'number' },
    stdout: STREAM_SCHEMA,
    stderr: STREAM_SCHEMA,
    sandbox: {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'denied'],
      properties: {
        mode: { type: 'string' },
        denied: { type: 'boolean' },
        enforcement: { type: 'string' },
        runnerFailed: { type: 'boolean' },
      },
    },
  },
}

/**
 * The tool's wire-format parameter schema. Unlike `defineTool` (which compiles
 * an author property map with per-property `required: true` flags), raw
 * `ctx.tools.register` stores and projects `parameters` unchanged, so this
 * must already be the registry's strict JSON Schema dialect.
 */
const PARAMETERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'description'],
  properties: {
    code: { type: 'string', description: 'Python 3 source to execute. Print results to stdout; send diagnostics to stderr.' },
    args: { type: 'array', items: { type: 'string' }, description: 'argv for the script (sys.argv[1:]); each element passes as one argument without shell parsing.' },
    description: {
      type: 'string',
      description: 'Clear, concise description of what this code does in active voice, 5-10 words (shown in the UI). '
        + 'Examples: "sum the CSV column" → "Sum one CSV column"; "rename photos by date" → "Rename photos by EXIF date".',
    },
    timeoutMs: { type: 'number', description: 'Timeout in milliseconds. The executor applies its configured default and cap, and kills the process on expiry.' },
    workdir: { type: 'string', description: 'Working directory for this run. Defaults to the session workspace; a relative path is resolved against it.' },
  },
}

/** The tool description the model reads. */
const TOOL_DESCRIPTION = 'Execute Python 3 code and return its stdout/stderr. '
  + 'The code runs as a script file in a fresh python process: no state (variables, imports, cwd) persists between calls — print results or write files instead. '
  + '`args` reaches the script as sys.argv[1:], one element per argument without shell parsing. '
  + 'stdin/stdout/stderr are forced to UTF-8. '
  + 'Prefer this tool over shell pipelines for computation, data processing, and multi-step logic; use the shell tool for process orchestration (git, pnpm, node). '
  + 'Non-zero exits are reported as `[exit code: N]`. '
  + 'Long output is truncated to its tail; the full output is saved to a file whose path is reported when available. '
  + 'The script may run under a file sandbox; a blocked file operation is reported as `[sandbox: file access denied under <mode> mode]` — a policy denial, not a bug in the code; do not retry another way.'

/**
 * Plugin body: register the `python` tool.
 * @param ctx - host root context.
 * @param config - resolved plugin config: `pythonPath` selects the interpreter
 *   (default `python`, resolved through the shell's PATH; an explicit absolute
 *   path pins the deployment and never depends on PATH).
 */
export function apply(ctx, config = {}) {
  const pythonPath = config.pythonPath ?? 'python'
  if (typeof pythonPath !== 'string' || pythonPath.length === 0) {
    throw new Error('tool-python: config.pythonPath must be a non-empty string')
  }

  const defaultMode = ctx.shell.sandboxMode
  const sandboxPolicy = defaultMode === undefined ? undefined : ctx.get('sandboxPolicy')
  if (defaultMode !== undefined && sandboxPolicy === undefined) {
    throw new Error('tool-python: the mounted shell executor confines but ctx.sandboxPolicy is missing')
  }

  ctx.systemPrompt.section({
    name: 'tool:python',
    order: 104,
    text: 'Prefer the python tool over shell pipelines for computation, data processing, text transformation, and multi-step logic: write Python code, run it, read the output. '
      + 'Use the shell tool only for process orchestration the Python stdlib does not cover (git, pnpm, node, service management). '
      + 'Non-zero python exits are reported as `[exit code: N]` markers; investigate failures before moving on.',
  })

  ctx.tools.register({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: PARAMETERS_SCHEMA,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: renderResult(value),
      }],
    },
    async execute(args, exec) {
      validateArgs(args)
      const standingPolicy = sandboxPolicy === undefined
        ? undefined
        : sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
      if (exec.signal.aborted) throw abortError()

      const workdir = resolveWorkdir(args.workdir, exec)
      const scriptDir = await mkdtemp(join(tmpdir(), `dsh-python-${randomUUID().slice(0, 8)}-`))
      const scriptPath = join(scriptDir, 'script.py')
      await writeFile(scriptPath, args.code, 'utf8')
      try {
        const argv = [psSingleQuoted(pythonPath), psSingleQuoted(scriptPath), ...(args.args ?? []).map(psSingleQuoted)]
        const command = `${UTF8_ENV_PREAMBLE}& ${argv.join(' ')}`
        // shellEnv is optional: without it the managed DSH_* facts are simply
        // omitted, which never justifies blocking the plugin row at load.
        const shellEnv = ctx.get('shellEnv')
        const request = {
          command,
          ...workdir !== undefined ? { workdir } : {},
          ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
          ...shellEnv !== undefined ? { dshEnv: shellEnv.collect(exec) } : {},
          ...standingPolicy !== undefined ? { sandboxPolicy: standingPolicy } : {},
          signal: exec.signal,
        }
        const result = await ctx.shell.run(ctx.shell.resolve(request))
        if (result.aborted) throw abortError()
        return canonicalResult(result)
      } finally {
        // Best-effort removal of the per-call script directory after the run
        // settled; an already-removed or locked directory needs no report.
        await rm(scriptDir, { recursive: true, force: true }).catch(() => {})
      }
    },
    presentCall(args) {
      const firstLine = args.code.split('\n', 1)[0].trim().slice(0, 60)
      return {
        card: 'terminal',
        title: firstLine.length > 0 ? `python ${firstLine}` : 'python',
        description: args.description,
        ...args.workdir !== undefined ? { cwd: args.workdir } : {},
      }
    },
    presentResult(_args, result) {
      const block = result.content.length === 1 ? result.content[0] : undefined
      if (block === undefined || block.type !== 'text' || typeof block.text !== 'string') return undefined
      if (result.isError) {
        return { card: 'generic', content: [{ type: 'text', text: `\`\`\`console\n${block.text.replace(/\n+$/, '')}\n\`\`\`` }] }
      }
      const { body, exit } = parseExitMarker(block.text)
      return { card: 'terminal', output: body, ...exit }
    },
  })
}

export const name = 'tool-python'
export const inject = ['tools', 'shell', 'systemPrompt']
