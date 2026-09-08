# Agent Note: Flat v0 replay state survives the v0→v1 migration

Status: implemented

English | [中文](2026-09-05-flat-v0-replay-state-migration-compat.zh.md)

## Problem

The released v0→v1 migration refuses two payload shapes that released v0 actually wrote, and each refusal (`SessionFormatUnsupportedError`) rejects the whole log, so the affected sessions' entire history fails to load after the 0.1.3-alpha.1 update; one deployment had eleven such sessions across both shapes.

**Flat pre-envelope replay state.** A `finish` stream chunk's `replayState` validates against the current `{response, blocks?}` envelope, but early released v0 builds also wrote a flat pre-envelope shape — the pi-ai response members (`kind: 'pi-ai'`, `version: 1`, `api`, `provider`, `model`, optional `responseModel`/`responseId`, `stopReason`, `blocks`) sit at the top level; one session carried both shapes because it spans the envelope transition. The runtime replay path already degrades the flat shape to provider-neutral history instead of failing, per the [max-token replay-state alignment decision](../bug-fix/2026-08-15-max-token-replay-state-alignment.md); only the migration-side admission was missing.

**Subagent descriptor version 2.** `subagent/descriptor` validates `version: 3` only, but the release that added the optional `agentReasoningEffort` member also bumped the version from 2 to 3, and earlier released v0 builds wrote version 2 — whose member set is a subset of version 3's. The runtime reader ignores a descriptor whose version it does not know, so admitting the shape losslessly changes no runtime semantics.

## Decision

`replayEnvelopeValue` in `dsh-session-format-v0-to-v1` now admits the flat pre-envelope shape next to the current envelope: a top-level `kind` member routes to `flatPreEnvelopeReplayValue`, which pins the exact released member set (`kind`/`version`/`api`/`provider`/`model`/`stopReason` required; `responseModel`/`responseId`/`blocks` optional) with basic member types and rejects an unknown `kind`. `subagentDescriptorValue` now admits versions 2 and 3. The migration keeps both values lossless — the identity edge carries the flat state and the version-2 descriptors into v1 and then v2 unchanged, so the `assistant/message` source-vs-assembly replay-state comparison stays consistent, and runtime replay keeps using its existing degrade path.

## Alternatives considered

**Convert the flat shape into the current envelope during migration.** Rejected: the flat shape records replay version 1, which `dsh-llm-pi-ai`'s envelope reader refuses (`unsupported version`), so an upgrade would only manufacture a value the consumer degrades anyway while dressing the log as current.

**Treat the chunk's `replayState` as opaque like the message source's.** Rejected: the message source deliberately skips value validation, but a durable stream chunk benefits from the known-shape admission guard; full opacity would silently admit any malformed member set.

## Consequences

Logs written by released v0 builds across both shape evolutions load again; the migration accepts both replay-state shapes even inside one session and both descriptor versions. Validation strength is unchanged for unknown shapes: an unrecognized top-level `kind` or member set, and a descriptor version outside 2–3, still refuse the log. The flat state in migrated v1/v2 logs remains dead weight for pi-ai replay reconstruction and continues to degrade per session, exactly as before the format migration existed.
