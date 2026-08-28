# @deepseek-ai/dsh-host-plugin-inventory

English | [中文](README.zh.md)

Read-only Host projection of the current Cordis Loader tree. `PluginInventoryGateway` registers the `pluginInventory` service and publishes one generated direct Remote, `pluginInventory/list`. Every call reads `ctx.loader.entries()` directly, skips structural group rows, and returns the remaining entries in Loader order with only their Loader entry id, module specifier, manifest description, effective enablement, and current root Fiber phase.

The description is the entry module's package manifest `description`, read through the healed `$DSH_HOME/profiles/node_modules` fallback that every profile-booted row resolves through. Each name is probed at `<module>/package.json` and then at the owning package root, so subpath rows (for example `@scope/pkg/startup`) report the package text; unresolvable names (`cordis:` builtins, not-installed rows) and manifests without usable text project `null` instead of failing the snapshot.

The phase is `pending`, `loading`, `active`, `failed`, or `unloading`; it is `null` when the entry has no live root Fiber. The snapshot is intentionally point-in-time: Loader remains the sole lifecycle authority, while this package owns no cache, history, provenance model, event stream, or mutation path. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time state only** — the result contains no durable failure history or subscription; a missing root Fiber is reported as `null`, regardless of why no live root exists.
- **No provenance or mutation** — the service does not identify which bundle, profile, or override introduced an entry, and it cannot enable, disable, add, or remove plugins.
