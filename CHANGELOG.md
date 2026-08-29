# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Tracks `@nestjslatam/ddd-lib` 3.0.0

The declared dependency moves from `^2.1.2` to `^3.0.0`, and with it the robot's default fixture version and the CI smoke install.

This matters beyond keeping current. The CLI reads the `ddd-lib` installed in your project and falls back to its own copy when there is none, so a stale bundled version would have shown anyone exploring the library standalone the **old `isValid` shape** — the very thing 3.0.0 unified.

### Fixed

Installing 3.0.0 immediately exposed a defect in the shape detection shipped alongside it. It read the declaration as:

```ts
/\bisValid\s*\(/.test(signature) ? 'method' : 'getter';
```

But a getter is emitted as `get isValid(): boolean` — that regex matches it too, because the parentheses are there either way. Every getter was reported as a method, which **inverted the diagnosis**: the rule then expected `isValid()` and stayed silent on exactly the call site it exists to catch. The `get` keyword is the only signal, and it is what the check looks for now.

Verified by running the built binary against a project with each version installed:

| Installed        | Code                | Reported                                                                             |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `3.0.0` (getter) | `if (!o.isValid())` | calls `isValid()`, but the installed library declares it as a **getter**             |
| `2.1.2` (method) | `if (!o.isValid)`   | reads `isValid` as a property, but the installed library declares it as a **method** |

Three unit tests pin the detection against both declaration forms and the no-library-installed fallback, so it cannot silently invert again. 73 tests, 51 robot scenarios.

## 0.2.0 (2026-08-28)

### Use it from the agent you already have

**`ddd mcp`** runs the CLI as an MCP server, so Claude Code, Codex, Cursor or anything else speaking MCP can drive it with **its own model — no API key**.

```bash
claude mcp add ddd -- npx -y @nestjslatam/ddd-cli mcp
```

The previous design had the CLI open its own connection to a model. If you are already working inside an agent, that agent has a model and credentials; provisioning a second set for the CLI is redundant. The division of labour is now explicit: the agent supplies the judgement — what to model, how to explain it — and the CLI supplies what a model is bad at, namely reading the installed declarations exactly, rendering deterministically, and auditing against the idiom.

Seven tools: `ddd_list`, `ddd_describe`, `ddd_new`, `ddd_extend`, `ddd_validate`, `ddd_aggregate_schema` and `ddd_render_aggregate`.

`ddd_describe` returns **facts rather than prose** on purpose — the agent writes the explanation, which is what it is for. `ddd_aggregate_schema` and `ddd_render_aggregate` make the split explicit: the agent produces a specification, the CLI renders it, and a specification that fails the schema comes back with per-field issues so the agent can correct itself without a human in the loop.

Nothing is written to disk unless a call passes `write: true`, and even then existing files are never overwritten: an agent acting unattended must not clobber hand-edited domain code.

### Unchanged

The direct-API providers remain for CI and standalone use. They were never required by more than two of the seven commands — `list`, `new`, `extend`, `validate` and `explain --raw` have never touched a model.

### Verification

The acceptance robot gained 12 scenarios driving the MCP server over stdio the way a client would, including an assertion that nothing outside the protocol reaches stdout — MCP is JSON-RPC on that stream, and one stray log line makes a client drop the connection. 51 passing of 53.

## 0.1.0 (2026-08-28)

First release. Published as `@nestjslatam/ddd-cli`.

An LLM-assisted CLI for working with [`@nestjslatam/ddd-lib`](https://www.npmjs.com/package/@nestjslatam/ddd-lib): understand the library, create any stereotype, extend it, and audit what you have written.

### Understanding the library

- **`ddd list`** — inventories every exported stereotype, grouped into seven families, read from the `.d.ts` files of the library **installed in your project** with the TypeScript compiler. No model involved, so it is exact and stays correct across library versions without the CLI being updated. Output turns on the distinction that is most of understanding the design: `extend` (a base you subclass, with its abstract members listed), `implement`, `compose` (a collaborator the aggregate delegates to) and `use`.
- **`ddd explain <symbol>`** — puts a model behind the same data, but the model only ever sees the real declaration and is instructed to say when it does not answer something rather than fill the gap. Facts print before the explanation; `--raw` skips the model entirely. Aliased exports are resolved, and near-miss names are ranked by edit distance.

### Creating and extending

- **`ddd new <stereotype> <Name>`** — value objects, rule validators, domain events, domain exceptions, aggregates and enums. Model-free: these have one correct shape, taken from the library's own code.
- **`ddd extend <base> <Name>`** — subclasses any library base, deriving the contract from the installed declarations rather than a table kept in the CLI. Asking to extend a collaborator or an interface explains the distinction instead of refusing.
- **`ddd generate:aggregate "<description>"`** — models a whole aggregate from prose. The model returns a validated specification; deterministic renderers turn it into code.

### Auditing

- **`ddd validate`** — four rules, each a mistake this library makes easy and silent, including the construction-order defect that shipped twice in `ddd-lib` itself. Exits non-zero on errors so it can gate a build.

### Providers

Claude (structured outputs, adaptive thinking) and OpenAI (`json_schema` with `strict: true`), auto-detected from whichever credential is present. Correctness does not rest on a provider honouring a schema: every response is parsed against a zod schema before anything is rendered.

### Look and feel

Output follows the [nestjslatam.dev](https://nestjslatam.dev/) identity, using the site's own design tokens. Colour degrades by terminal capability and honours `NO_COLOR`, `TERM=dumb` and piped output.

### Verification

54 unit tests, and an acceptance robot that drives the built binary against a real NestJS project across 41 scenarios — compiling the scaffolded output, not just reading it.
