# Agent Note: Manifest descriptions as the plugin explanation surface

Status: implemented

English | [中文](2026-08-27-plugin-description-projection.zh.md)

## Problem

The Settings **Plugin list** showed each entry's module name and enablement state, but nothing that says what the plugin is for. The information already exists — every workspace package declares an npm manifest `description`, and 244 of them carried one — yet nothing projected it to the browser, and nothing obliged a new package to write a usable one. The next plugin could ship with `"description": ""` or omit the field entirely and no gate would notice.

## Decision

One field, one line of text, flowing from the only place it is authored to every place it is read.

The Host inventory projects it. `PluginInventoryEntry` gains a `description: string | null`; on every `pluginInventory/list` call the gateway resolves each entry's module through the healed `$DSH_HOME/profiles/node_modules` anchor, probes `<module>/package.json` and then the owning package root, and returns the trimmed manifest text. Unresolvable names (`cordis:` builtins), rows whose package is not installed, and manifests without usable text project `null`; the snapshot never fails because a description is missing.

The Client renders it at three points of the disclosure card: a one-line summary under the card title (omitted while unresolvable), the full text under a localized Description label in the expanded details with a placeholder when null, and membership in the search corpus alongside module names and entry ids; the accessible card name includes it too.

The standard is mechanical. `pnpm run verify-package-descriptions` walks the root workspaces, selects manifests named `@deepseek-ai/dsh-*`, and applies a two-track rule: a manifest with a `dsh` block is a Loader-visible plugin whose description the GUI shows verbatim, so it must be one Simplified Chinese sentence of at least 10 characters containing at least one Han character; every other package declares one English sentence of at least 24 characters starting with a letter or `@`. It exposes an inspect function for vitest, fails loud with per-file diagnostics when run directly, joins the static hygiene leaves in `run-gates.ts`, and its rule is stated for authors in the [add-a-package cookbook](../../../../docs/cookbook/adding-a-package.md). Vendored and other foreign families are skipped by the name rule rather than an exclusion table, and the root manifest gained a real description instead of an exemption.

## Alternatives considered

**A separate registry file mapping plugins to explanations.** Rejected: the manifest field is the npm-native single source of truth next to the code it describes; a second home would drift from it on the first rename.

**Pre-reading descriptions once at boot into a cache.** Rejected: the inventory contract is point-in-time by design — the Loader stays the sole lifecycle authority and the gateway owns no cache; reading N local manifest files per `list()` call is cheap and keeps that shape.

**Gate checks non-empty string only.** Rejected: `"x"` passes and still explains nothing. Each track's floor is induced from the tree it governs (the shortest live library description is exactly 24 characters), so the floors cost nothing today while raising what tomorrow's description must say.

**Exempting the root manifest from the gate.** Rejected on the fail-loud principle; maintaining an exclusion list to avoid writing one true sentence about the workspace itself inverts the economics.

**Localized per-language descriptions from the plugin author.** Rejected: the manifest field faces developers, the GUI needs one authoritative line per plugin, and adding a locale layer would split that authority for a summary card. Requiring Simplified Chinese inside the single field follows the product-copy convention instead: the line reads natively in the shipped GUI without any locale machinery.

## Testing

The Host suite covers `readModuleDescription` against canned manifests on disk, Gateway projection with an injected reader, Loader-order preservation, and the real-profiles arm returning `null` for `cordis:` builtins. Client component tests pin the summary span, expanded description row and its missing-arm placeholder, the assembled accessible names, and description-text filtering. The gate's own spec pins each violation class on both tracks end to end, and running it directly over this repository reports 230 packages checked with zero failures.

## Consequences

Every future dsh package owes one honest sentence in its manifest — Simplified Chinese for plugins — and forgetting one turns CI red before review, which is the point. Each `list()` call does a few more local file reads, bounded by the installed plugin count. The DTO gains a nullable field with no wire compatibility concern under the current pre-release stance. Descriptions of third-party or vendored plugins stay whatever their upstream wrote, surfaced verbatim or omitted.
