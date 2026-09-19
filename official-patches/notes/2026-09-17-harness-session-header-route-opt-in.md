# Agent Note: Harness session header on a per-route opt-in

Status: implemented

English | [中文](2026-09-17-harness-session-header-route-opt-in.zh.md)

## Problem

A gateway that routes and prompt-caches per conversation can only do so when the request names the conversation. opencode.ai has required a session header since 2026-09-05 and answers a request without one with HTTP 400 `MissingSessionID`, which takes every model behind that gateway out of service.

`dsh-llm-deepseek` already sent the Harness session header on its own provider requests, so the gap was adapter-specific rather than protocol-wide: one conversation reached one provider carrying its identity and another provider without it, and only the second failed. A deployment could compensate by wrapping the process's `fetch`, but a wrapper is invisible to every other composition and moves a request-header decision out of the adapter that owns the request.

## Decision

`PiAiProviderProfile` gains `harnessSessionHeader?: boolean`. On a route that sets it, [`PiAiAdapter`](../../../../packages/llm/llm-pi-ai/src/adapter.ts) sends `x-deepseek-harness-session-id` — the same name `dsh-llm-deepseek` sends — carrying `String(GenerateOptions.sessionId)`.

The switch is off by default. The value names exactly one conversation, so a route carries that identity only where a deployment decides its gateway is entitled to it; a route reaching an arbitrary third-party gateway therefore keeps its previous behavior byte for byte until someone writes the field. The header is sent only when the route opted in *and* the caller named a session, so a direct `ctx.llm.stream()` call that passes no `sessionId` sends nothing even on an opted-in route.

The session header is merged into the request after the profile's own `headers`, so a deployment entry under the same name is overridden rather than trusted: only the request knows which conversation it belongs to, and a stale configured value would route live traffic to a dead conversation's cache. Attribution names win collisions the same way and for the same reason.

## Alternatives considered

**On by default.** The header is a product protocol fact, and `dsh-llm-deepseek` sends it unconditionally, so symmetry argued for sending it everywhere. It lost on scope: that adapter owns a DeepSeek endpoint, while this one serves whatever arbitrary gateway a profile names, including self-hosted servers. A per-conversation identifier that no current contract requires those routes to receive is not a default a deployment can be assumed to want, and turning it on for every existing route would have changed the bytes they send without anyone asking.

**Deriving the decision from the endpoint host.** Matching `opencode.ai` inside the adapter, as the deployment-level workaround did, would have made the header arrive with no configuration at all. It lost because a vendor domain is not a fact this package should hold: the protocol name it already publishes (`api`, `compat`, `baseURL`) describes an endpoint's wire behavior, not who operates it, and a host list would silently stop working for a gateway that renames its endpoint or fronts it behind another domain.

**Extending `headers` with a placeholder value.** A template such as `x-opencode-session: $session` would have reused the existing field instead of adding one. It lost because `headers` is presently a plain string dictionary whose entries profile resolution validates against Fetch and whose values a redactor treats as configuration; a placeholder syntax turns every existing entry into a string that might be a template, and every consumer — discovery, the settings editor, the redactor — would have to agree on the grammar.

**pi-ai's own `sendSessionAffinityHeaders` compat switch.** pi-ai already emits session-affinity headers for some providers, and the compat field is withheld from configuration rather than exposed. It lost because the header it emits is `x-session-affinity`, which opencode.ai does not accept as a session identity: a request carrying it still answers HTTP 400 `MissingSessionID`. Reusing the switch would have required a second mechanism anyway.

## Consequences

A deployment whose gateway requires a session header now sets one boolean per route instead of installing a process-wide `fetch` wrapper. This machine's `dsh-opencode-session-id` plugin remains compatible — it appends `x-opencode-session` only when that header is absent, and the two names are independent — so a composition can run both while a route is migrated.

The header name is declared in two packages: this adapter and each of `dsh-llm-deepseek`'s two protocol adapters. They are the same protocol constant, and the duplication is recorded rather than fixed here to keep the change inside the adapter that was missing it; a third consumer is the point at which a shared constant earns its extraction.

Only routes that opt in are affected. Discovery requests are not: [`storedDiscoveryProfile`](../../../../packages/llm/llm-pi-ai/src/index.ts) supplies headers and a credential for endpoint interrogation, and a model listing is not part of any conversation, so it carries no session identity.

**Coverage.** [`adapter.spec.ts`](../../../../packages/llm/llm-pi-ai/tests/adapter.spec.ts) pins the three states: an opted-in route sends the live conversation id and overrides a profile entry of the same name; a route without the field sends nothing while a session is in scope; an opted-in route sends nothing when the caller names no session. A fourth case rejects a non-boolean value at plugin load.

**Verification gap.** The tests assert the header on a mock server and do not exercise a real gateway. That a specific operator accepts this header name is an external contract this repository cannot pin, and it is the fact most likely to change without notice; the switch's default is what keeps such a change from reaching routes that never asked for it.

## Related

This decision extends where the session header can travel; it does not move who owns it. [The DeepSeek request-identity decision](2026-08-11-deepseek-request-user-id-header.md) still owns the header on direct DeepSeek requests and the `x-deepseek-harness-user-id` companion, which this adapter does not send. [The mandatory app-attribution decision](../architecture/2026-06-21-mandatory-app-attribution-headers.md) still owns `User-Agent` and remains the rule that a provider receives no further identity header without a decision accepting it — which is what the per-route opt-in here is.
