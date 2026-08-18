/**
 * dsh-bug-log — persistent BUG knowledge base for DSH sessions (host half).
 *
 * Four layers (see README.md):
 *   1. record  — `bug_report` tool: one structured record per bug, written
 *                atomically (tmp+rename, D4) as frontmatter+markdown into the
 *                shared buglog directory; INDEX.md rebuilds after every write.
 *   2. search  — `bug_search` tool: structured filtering over the records.
 *   3. stats   — `bug_stats` tool: aggregation by component/severity/month/status.
 *   4. recall  — a system-prompt section re-rendered per request: the
 *                mandatory record rule, the search-before-investigating nudge,
 *                and any pending backfill reminder surfaced by the heuristic
 *                below.
 *
 * Missed-record heuristic (best effort, never blocks a turn): `tools/result`
 * accumulates per-agent signals — failed tool calls plus successful
 * write/edit/python/pwsh work looks like a fix; `agent/turn-stopping` writes a
 * pending reminder when that pattern appears without any bug_report call. The
 * reminder renders in the prompt section until the next successful bug_report
 * (or manual deletion).
 *
 * STANDARD COMPLIANCE (PLUGIN-STANDARD.md):
 *  - P2 zero workspace imports: only node: builtins and injected services.
 *  - P3 minimal injections: `tools` and `systemPrompt` only.
 *  - P4 schema dialect: `required` is a parent-level string array everywhere.
 *  - P5 registrations wrapped in ctx.effect with disposers.
 *  - P6 config validated loud at load; execute failures are tool errors.
 *  - P7/D4: UTF-8 everywhere; whole-file atomic replacement, no line surgery.
 */

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

/**
 * Default shared buglog directory: the DSH-ops repo's buglog/, derived from
 * this module's own location (plugins/dsh-bug-log → two levels up: DSH-ops),
 * so any drive letter works as long as the sibling layout holds.
 */
const DEFAULT_BUGLOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'buglog')

/** INDEX file name, excluded from record enumeration. */
const INDEX_FILE = 'INDEX.md'

/** Pending-reminder marker file (JSON array, lives in the buglog directory). */
const PENDING_FILE = '.pending-backfills.json'

/** Tools whose successful calls count as fix-shaped activity. */
const FIX_SHAPED_TOOLS = new Set(['edit', 'write', 'str_replace_editor', 'python', 'pwsh'])

/** Severity values shared by the tool schema and the frontmatter. */
const SEVERITIES = ['critical', 'major', 'minor']

/** Status values shared by the tool schema and the frontmatter. */
const STATUSES = ['fixed', 'workaround', 'open']

/** Prompt order of the mandatory section (100-199 per-tool guidance band). */
const SECTION_ORDER = 106

// ---- frontmatter codec (self-consistent: this module writes and reads it) ----

/**
 * Render one record's frontmatter block. String values are JSON-stringified
 * (valid quoted YAML); the files array renders as `- item` lines.
 * @param record - the structured record fields.
 * @returns the full `--- ... ---` block including the trailing newline.
 */
function renderFrontmatter(record) {
  const lines = ['---']
  const scalar = (key, value) => { lines.push(`${key}: ${JSON.stringify(String(value))}`) }
  scalar('date', record.date)
  scalar('symptom', record.symptom)
  scalar('component', record.component)
  scalar('severity', record.severity)
  scalar('status', record.status)
  scalar('root_cause', record.root_cause)
  scalar('fix', record.fix)
  lines.push('related_files:')
  for (const file of record.related_files) lines.push(`  - ${JSON.stringify(file)}`)
  if (record.dsh_commit !== undefined) scalar('dsh_commit', record.dsh_commit)
  lines.push('---')
  return lines.join('\n') + '\n'
}

/**
 * Parse a record's frontmatter back into fields (the inverse of
 * {@link renderFrontmatter}; files this module did not write are skipped by
 * callers on parse failure).
 * @param text - full record file text.
 * @returns the structured fields, or undefined when no valid block exists.
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return undefined
  const end = text.indexOf('\n---\n', 4)
  if (end === -1) return undefined
  const fields = {}
  let lastArrayKey
  for (const rawLine of text.slice(4, end).split('\n')) {
    if (rawLine.length === 0) continue
    const listItem = rawLine.match(/^\s+-\s+(.*)$/)
    if (listItem !== null && lastArrayKey !== undefined) {
      fields[lastArrayKey].push(decodeValue(listItem[1]))
      continue
    }
    const pair = rawLine.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (pair === null) continue
    const [, key, rawValue] = pair
    if (rawValue.length === 0) {
      fields[key] = []
      lastArrayKey = key
    } else {
      fields[key] = decodeValue(rawValue)
      lastArrayKey = undefined
    }
  }
  return fields
}

/** Decode one frontmatter scalar (JSON string first, raw text otherwise). */
function decodeValue(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// ---- storage helpers ---------------------------------------------------------

/**
 * Whole-file atomic replacement: write a sibling temp file, then rename over
 * the target.
 * @param file - absolute target path.
 * @param content - full UTF-8 text.
 */
async function writeFileAtomic(file, content) {
  const temp = `${file}.tmp-${randomUUID().slice(0, 8)}`
  await writeFile(temp, content, 'utf8')
  await rename(temp, file)
}

/**
 * Enumerate record files (date-prefixed markdown), newest first by name.
 * @param dir - buglog directory.
 * @returns sorted relative file names.
 */
async function listRecordFiles(dir) {
  if (!existsSync(dir)) return []
  const names = await readdir(dir)
  return names
    .filter(name => /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(name))
    .sort()
    .reverse()
}

/**
 * Read and parse every record; unreadable or malformed files are counted, not
 * thrown — one damaged record never blocks search or stats.
 * @param dir - buglog directory.
 * @returns parsed records with their file names plus a skipped count.
 */
async function readAllRecords(dir) {
  const records = []
  let skipped = 0
  for (const name of await listRecordFiles(dir)) {
    try {
      const fields = parseFrontmatter(await readFile(join(dir, name), 'utf8'))
      if (fields === undefined || typeof fields.symptom !== 'string') {
        skipped += 1
        continue
      }
      records.push({ file: name, ...fields })
    } catch {
      skipped += 1
    }
  }
  return { records, skipped }
}

/**
 * Rebuild INDEX.md from all records (newest-first table plus counts).
 * @param dir - buglog directory.
 */
async function rebuildIndex(dir) {
  const { records } = await readAllRecords(dir)
  const count = status => records.filter(record => record.status === status).length
  const header = '# BUG 记录索引\n\n'
    + `共 ${records.length} 条（fixed ${count('fixed')} / workaround ${count('workaround')} / open ${count('open')}）。`
    + '检索用 bug_search，统计用 bug_stats；本文件由 bug_report 自动重建，勿手编辑。\n\n'
    + '| 日期 | 记录 | 组件 | 严重度 | 状态 | 症状 |\n|---|---|---|---|---|---|\n'
  const rows = records.map(record =>
    `| ${String(record.date ?? '').slice(0, 10)} | [${record.file.replace(/\.md$/, '')}](${record.file})`
    + ` | ${record.component ?? '-'} | ${record.severity ?? '-'} | ${record.status ?? '-'} | ${escapeCell(record.symptom)} |`)
  await mkdir(dir, { recursive: true })
  await writeFileAtomic(join(dir, INDEX_FILE), header + rows.join('\n') + '\n')
}

/** Escape one markdown table cell (pipes and newlines). */
function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/** Read pending backfill reminders; an absent or damaged file means none. */
async function readPending(dir) {
  try {
    const parsed = JSON.parse(await readFile(join(dir, PENDING_FILE), 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Replace the pending-reminder file atomically, capped at the latest 20. */
async function writePending(dir, items) {
  await mkdir(dir, { recursive: true })
  await writeFileAtomic(join(dir, PENDING_FILE), JSON.stringify(items.slice(-20), null, 2) + '\n')
}

// ---- record rendering --------------------------------------------------------

/**
 * Build the full record file text: frontmatter plus the readable body.
 * @param args - validated bug_report arguments.
 * @param now - ISO timestamp of the report.
 * @returns full markdown text.
 */
function renderRecordFile(args, now) {
  const record = {
    date: now,
    symptom: args.symptom,
    component: args.component,
    severity: args.severity,
    status: args.status,
    root_cause: args.root_cause,
    fix: args.fix,
    related_files: args.related_files ?? [],
    ...args.dsh_commit !== undefined ? { dsh_commit: args.dsh_commit } : {},
  }
  const body = args.details !== undefined && args.details.trim().length > 0
    ? `\n${args.details.trim()}\n`
    : '\n(No additional details recorded.)\n'
  return renderFrontmatter(record) + body
}

/**
 * Derive a filesystem-safe slug from the symptom.
 * @param symptom - one-line symptom text.
 * @returns lowercase hyphenated slug (max 40 chars).
 */
function slugify(symptom) {
  const slug = symptom.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return slug.length > 0 ? slug : 'bug'
}

// ---- prompt section ----------------------------------------------------------

/**
 * The mandatory-record prompt section, re-rendered per request so pending
 * backfill reminders surface without extra session plumbing. The sync read is
 * one small file per LLM request.
 * @param buglogDir - configured buglog directory.
 * @returns the section registration (function-form text).
 */
function buglogSection(buglogDir) {
  return {
    name: 'tool:bug-log',
    order: SECTION_ORDER,
    text: () => {
      const base = 'Bug knowledge base: after you find and fix ANY bug (anywhere — core repo, plugins, ops scripts, environment), you MUST call bug_report with symptom, root cause, fix, component, severity, and status before moving on — a fix without a record is an incomplete task. '
        + 'Before investigating any anomaly, error, or unexpected behavior, call bug_search first: a matching past record usually already contains the root cause and the fix. '
        + 'Call bug_stats for aggregate counts (by component, severity, month, or status). '
        + 'Records persist in a shared directory and follow every future session on this machine.'
      let pending = []
      try {
        const parsed = JSON.parse(readFileSync(join(buglogDir, PENDING_FILE), 'utf8'))
        if (Array.isArray(parsed)) pending = parsed
      } catch { /* no reminders */ }
      if (pending.length === 0) return base
      const latest = pending[pending.length - 1]
      return `${base}\nUnrecorded fix-shaped activity was detected in a previous session (last at ${latest.time}). Call bug_report now to backfill it, or state in your reply why it was not a bug fix.`
    },
  }
}

// ---- validation ---------------------------------------------------------------

/**
 * Validate bug_report value constraints the schema cannot express.
 * @param args - parsed model arguments.
 */
function validateReportArgs(args) {
  for (const field of ['symptom', 'root_cause', 'fix', 'component', 'description']) {
    if (typeof args[field] !== 'string' || args[field].trim().length === 0) {
      throw new Error(`invalid ${field}: expected a non-empty string`)
    }
  }
  if (!SEVERITIES.includes(args.severity)) {
    throw new Error(`invalid severity: expected one of ${SEVERITIES.join(', ')}`)
  }
  if (!STATUSES.includes(args.status)) {
    throw new Error(`invalid status: expected one of ${STATUSES.join(', ')}`)
  }
  if (args.related_files !== undefined) {
    if (!Array.isArray(args.related_files) || args.related_files.some(item => typeof item !== 'string')) {
      throw new Error('invalid related_files: expected an array of strings')
    }
  }
  if (args.dsh_commit !== undefined && !/^[0-9a-f]{7,40}$/.test(args.dsh_commit)) {
    throw new Error('invalid dsh_commit: expected a 7-40 hex commit id')
  }
  if (args.slug !== undefined && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(args.slug)) {
    throw new Error('invalid slug: expected 1-40 chars of lowercase a-z, 0-9, hyphens, no leading/trailing hyphen')
  }
}

// ---- schemas (P4 dialect: parent-level required arrays only) ------------------

const RECORD_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'date', 'symptom', 'component', 'severity', 'status'],
  properties: {
    file: { type: 'string' },
    date: { type: 'string' },
    symptom: { type: 'string' },
    component: { type: 'string' },
    severity: { type: 'string' },
    status: { type: 'string' },
  },
}

const REPORT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recorded', 'file', 'index_updated', 'pending_cleared', 'total_records'],
  properties: {
    recorded: { type: 'boolean' },
    file: { type: 'string' },
    index_updated: { type: 'boolean' },
    pending_cleared: { type: 'boolean' },
    total_records: { type: 'integer' },
  },
}

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['total_matched', 'returned', 'records', 'skipped_files'],
  properties: {
    total_matched: { type: 'integer' },
    returned: { type: 'integer' },
    records: { type: 'array', items: RECORD_SUMMARY_SCHEMA },
    skipped_files: { type: 'integer' },
  },
}

const STATS_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'total_records', 'not_fixed', 'groups'],
  properties: {
    dimension: { type: 'string' },
    total_records: { type: 'integer' },
    not_fixed: { type: 'integer' },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'count'],
        properties: { key: { type: 'string' }, count: { type: 'integer' } },
      },
    },
  },
}

// ---- plugin body --------------------------------------------------------------

/**
 * Plugin body: register the three tools, the prompt section, and the
 * missed-record heuristic listeners.
 * @param ctx - host root context.
 * @param config - resolved plugin config: `buglogDir` selects the shared
 *   record directory (default: the DSH-ops repo's buglog/, git-synced).
 */
export function apply(ctx, config = {}) {
  const buglogDir = typeof config.buglogDir === 'string' && config.buglogDir.length > 0
    ? config.buglogDir
    : DEFAULT_BUGLOG_DIR

  ctx.effect(() => ctx.systemPrompt.section(buglogSection(buglogDir)))

  // ---- bug_report -----------------------------------------------------------
  ctx.effect(() => ctx.tools.register({
    name: 'bug_report',
    description: 'Record one bug you found and fixed (or worked around) into the persistent bug knowledge base. '
      + 'MANDATORY after every fix, before moving on: symptom, root cause, fix, component, severity, status. '
      + '`details` carries the investigation narrative future readers need. '
      + 'Records persist across sessions and machines; the index rebuilds automatically.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['symptom', 'root_cause', 'fix', 'component', 'severity', 'status', 'description'],
      properties: {
        symptom: { type: 'string', description: 'One-line observable symptom (what went wrong, where).' },
        root_cause: { type: 'string', description: 'The verified root cause, not the surface error.' },
        fix: { type: 'string', description: 'What fixed it (commit, file change, config, procedure).' },
        component: { type: 'string', description: 'Owning area: package/plugin name, ops script, or environment (e.g. dsh-tool-python, update-dsh.ps1, python-env).' },
        severity: { type: 'string', enum: [...SEVERITIES], description: 'critical: blocks startup or data loss; major: feature broken or wrong results; minor: cosmetic or annoyance.' },
        status: { type: 'string', enum: [...STATUSES], description: 'fixed / workaround (active bypass, root cause pending) / open (diagnosed, not yet fixed).' },
        related_files: { type: 'array', items: { type: 'string' }, description: 'Files most relevant to the bug.' },
        dsh_commit: { type: 'string', description: 'Current DSH repo commit (7-40 hex), when known.' },
        details: { type: 'string', description: 'Investigation narrative: how it was found, what was ruled out, how the fix was verified.' },
        slug: { type: 'string', description: 'Optional filesystem-safe slug for the record file name (lowercase a-z0-9 and hyphens, max 40 chars); defaults to a slug derived from the symptom.' },
        description: { type: 'string', description: 'Clear, concise description of this record action in active voice, 5-10 words (shown in the UI).' },
      },
    },
    output: {
      schema: REPORT_OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `bug recorded: ${value.file} (index rebuilt, ${value.total_records} total)`,
      }],
    },
    async execute(args) {
      validateReportArgs(args)
      const now = new Date().toISOString()
      await mkdir(buglogDir, { recursive: true })
      const existing = new Set(await listRecordFiles(buglogDir))
      const base = args.slug !== undefined ? args.slug : slugify(args.symptom)
      let file = `${now.slice(0, 10)}-${base}.md`
      for (let n = 2; existing.has(file); n += 1) file = `${now.slice(0, 10)}-${base}-${n}.md`
      await writeFileAtomic(join(buglogDir, file), renderRecordFile(args, now))
      await rebuildIndex(buglogDir)
      const hadPending = (await readPending(buglogDir)).length > 0
      if (hadPending) await writePending(buglogDir, [])
      const { records } = await readAllRecords(buglogDir)
      return { recorded: true, file, index_updated: true, pending_cleared: hadPending, total_records: records.length }
    },
    presentCall: args => ({
      card: 'generic',
      title: `bug_report: ${String(args.symptom ?? '').slice(0, 80)}`,
      kind: 'execute',
      rawInput: args.symptom,
      content: [{ type: 'text', text: args.description }],
    }),
  }))

  // ---- bug_search -----------------------------------------------------------
  ctx.effect(() => ctx.tools.register({
    name: 'bug_search',
    description: 'Search the persistent bug knowledge base BEFORE investigating any anomaly — a matching record usually already contains the root cause and fix. '
      + 'Filters combine with AND; `query` matches symptom, root cause, fix, and component (case-insensitive). '
      + 'Read the returned file for the full record.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'Free-text substring matched across symptom, root cause, fix, and component.' },
        component: { type: 'string', description: 'Exact component filter.' },
        severity: { type: 'string', enum: [...SEVERITIES], description: 'Exact severity filter.' },
        status: { type: 'string', enum: [...STATUSES], description: 'Exact status filter.' },
        since: { type: 'string', description: 'Only records dated on or after this date (YYYY-MM-DD).' },
        limit: { type: 'number', description: 'Max records returned (default 20).' },
      },
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: value.total_matched === 0
          ? 'no matching bug records'
          : `${value.total_matched} match(es), showing ${value.returned}:\n`
            + value.records.map(record => `- ${record.date.slice(0, 10)} [${record.severity}/${record.status}] ${record.component}: ${record.symptom} (${record.file})`).join('\n'),
      }],
    },
    async execute(args) {
      const { records, skipped } = await readAllRecords(buglogDir)
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : undefined
      const matched = records.filter(record => {
        if (query !== undefined) {
          const haystack = `${record.symptom}\n${record.root_cause ?? ''}\n${record.fix ?? ''}\n${record.component ?? ''}`.toLowerCase()
          if (!haystack.includes(query)) return false
        }
        if (args.component !== undefined && record.component !== args.component) return false
        if (args.severity !== undefined && record.severity !== args.severity) return false
        if (args.status !== undefined && record.status !== args.status) return false
        if (args.since !== undefined && String(record.date ?? '') < args.since) return false
        return true
      })
      const limit = typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 20
      const page = matched.slice(0, limit).map(record => ({
        file: record.file,
        date: String(record.date ?? ''),
        symptom: String(record.symptom ?? ''),
        component: String(record.component ?? ''),
        severity: String(record.severity ?? ''),
        status: String(record.status ?? ''),
      }))
      return { total_matched: matched.length, returned: page.length, records: page, skipped_files: skipped }
    },
    presentCall: args => ({
      card: 'generic',
      title: `bug_search: ${args.query ?? args.component ?? '(all)'}`,
      kind: 'execute',
      rawInput: args.query ?? args.component ?? '',
      content: [{ type: 'text', text: 'search bug records' }],
    }),
  }))

  // ---- bug_stats --------------------------------------------------------------
  ctx.effect(() => ctx.tools.register({
    name: 'bug_stats',
    description: 'Aggregate the bug knowledge base: counts grouped by component, severity, month, or status. Use for summaries and trend reviews.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['by'],
      properties: {
        by: { type: 'string', enum: ['component', 'severity', 'month', 'status'], description: 'Grouping dimension.' },
        since: { type: 'string', description: 'Only records dated on or after this date (YYYY-MM-DD).' },
        until: { type: 'string', description: 'Only records dated on or before this date (YYYY-MM-DD).' },
      },
    },
    output: {
      schema: STATS_OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `bug records by ${value.dimension}: ${value.total_records} total (${value.not_fixed} not fixed)\n`
          + value.groups.map(group => `- ${group.key}: ${group.count}`).join('\n'),
      }],
    },
    async execute(args) {
      const { records } = await readAllRecords(buglogDir)
      const filtered = records.filter(record => {
        const date = String(record.date ?? '')
        if (args.since !== undefined && date < args.since) return false
        if (args.until !== undefined && date > `${args.until}T99`) return false
        return true
      })
      const counts = new Map()
      for (const record of filtered) {
        const key = args.by === 'month'
          ? String(record.date ?? '').slice(0, 7)
          : String(record[args.by] ?? '(none)')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const groups = [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      return {
        dimension: args.by,
        total_records: filtered.length,
        not_fixed: filtered.filter(record => record.status !== 'fixed').length,
        groups,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: `bug_stats by ${args.by}`,
      kind: 'execute',
      rawInput: args.by,
      content: [{ type: 'text', text: 'aggregate bug records' }],
    }),
  }))

  // ---- missed-record heuristic ------------------------------------------------
  // One signal cell per agent: errors, fix-shaped successes, and whether the
  // current batch was reported. Signals ACCUMULATE across turns (a failure in
  // turn N and its fix in turn N+1 must be caught at N+1's turn end) and reset
  // after a reminder fires or a bug_report succeeds. A new error opens a new
  // batch, so a report for an earlier bug never suppresses a later one. The
  // WeakMap needs no session id and collects itself when the agent is disposed.
  const signals = new WeakMap()

  /** Five-minute window inside which the same reminder is refreshed, not duplicated. */
  const REMINDER_COOLDOWN_MS = 5 * 60 * 1000

  function signalOf(agent) {
    let signal = signals.get(agent)
    if (signal === undefined) {
      signal = { errors: 0, fixes: 0, reported: false }
      signals.set(agent, signal)
    }
    return signal
  }

  /** Clear pending reminders without ever throwing into an event listener. */
  async function clearPendingQuietly() {
    try {
      if ((await readPending(buglogDir)).length > 0) await writePending(buglogDir, [])
    } catch { /* reminder hygiene is best-effort */ }
  }

  ctx.effect(() => ctx.on('tools/result', (exec, result) => {
    try {
      if (exec.agent === undefined) return
      const signal = signalOf(exec.agent)
      if (exec.name === 'bug_report' && !result.isError) {
        signal.reported = true
        signal.errors = 0
        signal.fixes = 0
        void clearPendingQuietly()
      } else if (result.isError) {
        signal.errors += 1
        signal.reported = false
      } else if (FIX_SHAPED_TOOLS.has(exec.name)) {
        signal.fixes += 1
      }
    } catch { /* heuristic must never disturb a tool result */ }
  }))

  ctx.effect(() => ctx.on('agent/turn-stopping', async (payload) => {
    try {
      const signal = signals.get(payload.agent)
      if (signal === undefined) return
      const missed = signal.errors > 0 && signal.fixes > 0 && !signal.reported
      // Keep the agent entry so failures accumulate across turns; reset the
      // counters either way so a fired reminder is not re-fired every turn.
      signal.errors = 0
      signal.fixes = 0
      if (missed) {
        const pending = await readPending(buglogDir)
        const now = Date.now()
        const last = pending[pending.length - 1]
        if (last !== undefined && now - new Date(last.time).getTime() < REMINDER_COOLDOWN_MS) {
          last.time = new Date().toISOString()
        } else {
          pending.push({ time: new Date().toISOString(), hint: 'fix-shaped activity without a bug_report call' })
        }
        await writePending(buglogDir, pending)
      }
    } catch { /* heuristic must never disturb the turn */ }
  }))
}

export const name = 'bug-log'
export const inject = ['tools', 'systemPrompt']
