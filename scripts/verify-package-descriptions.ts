/**
 * Enforce the package description standard for repository-owned DSH npm
 * packages: the settings plugin inventory projects each plugin manifest
 * description into the web GUI, so every package must declare a usable
 * description, and every Loader-visible plugin must describe its role in
 * one human-readable Simplified Chinese line.
 * @module scripts/verify-package-descriptions
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DSH_PACKAGE_NAME = /^@deepseek-ai\/dsh(?:-|$)/
/** Shortest usable English description for a package without a `dsh` manifest. */
const MIN_LIBRARY_DESCRIPTION_LENGTH = 24
/** Shortest usable Simplified-Chinese description for a Loader-visible plugin. */
const MIN_PLUGIN_DESCRIPTION_LENGTH = 10
/** First glyph of a library description: a letter or the npm scope marker; never punctuation or whitespace. */
const LIBRARY_DESCRIPTION_START = /^[A-Za-z@]/
/** Any Han glyph: marks a description as written in Simplified Chinese. */
const CHINESE_SCRIPT = /\p{Script=Han}/u

/** Result of checking every DSH package reachable through the root workspace list. */
export interface DshPackageDescriptionReport {
  /** Number of DSH package manifests checked. */
  packageCount: number
  /** Repository-relative diagnostics for missing or unusable descriptions. */
  failures: string[]
}

/** Which half of the standard applies to one manifest. */
export interface DescriptionStandardOptions {
  /**
   * Whether the manifest declares a `dsh` block, making the package a
   * Loader-visible plugin whose description the web GUI shows verbatim.
   */
  readonly plugin: boolean
}

function readManifest(root: string, file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`verify-package-descriptions: ${file} must contain a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')
}

function workspaceManifestPaths(root: string): string[] {
  const rootManifest = readManifest(root, 'package.json')
  const workspaces = rootManifest.workspaces
  if (!isStringArray(workspaces)) {
    throw new Error('verify-package-descriptions: package.json workspaces must be a string array.')
  }

  const files = new Set(['package.json'])
  for (const pattern of workspaces) {
    for (const file of globSync(`${pattern}/package.json`, { cwd: root })) {
      files.add(file)
    }
  }
  return [...files].sort()
}

/**
 * Name one standard violation for a manifest description, or null when the
 * description satisfies the standard. Plugin manifests must describe their
 * role in Simplified Chinese because the GUI card shows the line verbatim;
 * plain library packages keep the original English noun-phrase standard.
 * @param description - raw manifest `description` value.
 * @param options - which half of the standard applies.
 */
export function describeDescriptionViolation(
  description: unknown,
  options: DescriptionStandardOptions,
): string | null {
  if (typeof description !== 'string' || description.trim().length === 0) {
    return 'must declare a non-empty "description"'
  }
  const text = description.trim()
  if (options.plugin) {
    if (!CHINESE_SCRIPT.test(text)) {
      return '"description" must be written in Simplified Chinese (the GUI shows it verbatim as the plugin explanation)'
    }
    if (text.length < MIN_PLUGIN_DESCRIPTION_LENGTH) {
      return `"description" is shorter than ${MIN_PLUGIN_DESCRIPTION_LENGTH} characters`
    }
    return null
  }
  if (text.length < MIN_LIBRARY_DESCRIPTION_LENGTH) {
    return `"description" is shorter than ${MIN_LIBRARY_DESCRIPTION_LENGTH} characters`
  }
  if (!LIBRARY_DESCRIPTION_START.test(text)) {
    return '"description" must start with a letter or "@"'
  }
  return null
}

/**
 * Check the manifest description of every DSH package declared by the
 * repository workspace against the matching half of the standard.
 * @param root - absolute repository root containing the workspace package.json.
 * @returns the checked package count and every description violation.
 */
export function inspectDshPackageDescriptions(root: string): DshPackageDescriptionReport {
  let packageCount = 0
  const failures: string[] = []

  for (const file of workspaceManifestPaths(root)) {
    const manifest = readManifest(root, file)
    const name = manifest.name
    if (typeof name !== 'string' || !DSH_PACKAGE_NAME.test(name)) continue

    packageCount++
    const violation = describeDescriptionViolation(manifest.description, {
      plugin: manifest.dsh !== undefined,
    })
    if (violation !== null) {
      const normalizedFile = file.split(sep).join('/')
      failures.push(`${normalizedFile}: ${name} ${violation}.`)
    }
  }

  return { packageCount, failures }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const report = inspectDshPackageDescriptions(ROOT)
  if (report.failures.length > 0) {
    process.stderr.write('verify-package-descriptions: DSH package description violations found:\n')
    for (const failure of report.failures) process.stderr.write(`  ${failure}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(
      `verify-package-descriptions: ${String(report.packageCount)} DSH package(s) checked; all declare a usable description.\n`,
    )
  }
}
