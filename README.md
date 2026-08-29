# @nestjslatam/ddd-cli

A command-line tool for `@nestjslatam/ddd-lib`: inventory its stereotypes, scaffold them, subclass them, audit your code against its idiom, and model an aggregate from prose. It also runs as an MCP server, so an agent drives it with its own model.

[![npm](https://img.shields.io/npm/v/%40nestjslatam%2Fddd-cli.svg)](https://www.npmjs.com/package/@nestjslatam/ddd-cli) [![CI](https://github.com/nestjslatam/ddd-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/nestjslatam/ddd-cli/actions/workflows/ci.yml)

> [!WARNING]
> **Pre-1.0.** `0.2.0` is under active development; the surface can change in any minor release, so pin an exact version.

```bash
npm install -g @nestjslatam/ddd-cli
```

```bash
ddd list --role extend                        # what the installed library lets you subclass
ddd new value-object OrderTotal --kind number # scaffold one, no model involved
ddd validate                                  # audit what you wrote against the idiom
```

`ddd list` reads the `.d.ts` files of the `@nestjslatam/ddd-lib` installed in your project with the TypeScript compiler, so it reports what is actually there rather than a table kept in this CLI. Against `ddd-lib@2.1.2`:

```
  Value Objects
  extend     DddValueObject  extends AbstractNotifyPropertyChanged · implement getEqualityComponents

  Validation & Business Rules
  extend     AbstractRuleValidator  implement addRules
  extend     AbstractValidator      implement validate

  Domain Events
  extend     AbstractDomainEvent  alias of DomainEvent

  9 symbols · ddd explain <name> for any of them
```

(Abridged. Aliases are resolved; `-f, --family` and `-r, --role` narrow the list, and `ddd explain <symbol> --raw` prints one declaration with no model call.)

## The ecosystem

| Package                                                                                        | What it is                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@nestjslatam/ddd-lib`](https://www.npmjs.com/package/@nestjslatam/ddd-lib)                   | DDD building blocks: aggregates, value objects, validators, broken rules, state tracking                                                   |
| **[`@nestjslatam/ddd-cli`](https://www.npmjs.com/package/@nestjslatam/ddd-cli)**               | Inventory the stereotypes, scaffold them, subclass them, audit your code. Runs as an MCP server so an AI agent can drive it — you are here |
| [`@nestjslatam/ddd-valueobjects`](https://www.npmjs.com/package/@nestjslatam/ddd-valueobjects) | Ready-made value objects: email, phone number, money, date range, document id                                                              |
| [`@nestjslatam/ddd-es-lib`](https://www.npmjs.com/package/@nestjslatam/ddd-es-lib)             | Event sourcing: event store, snapshots, upcasting, sagas, materialised views                                                               |

## Requirements

- Node 20.11 or later (`engines` in the manifest; CI runs 20.x and 22.x).
- A project with `@nestjslatam/ddd-lib` installed. The CLI prefers your project's copy and falls back to the one it ships as a runtime dependency, so what it reports tracks the version you actually depend on. Commands still run without it; `generate:aggregate` warns that the output will not compile until you install it.
- `@nestjs/cqrs`, a peer dependency of `ddd-lib`, for the generated command handlers and modules to compile.
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` for `explain` and `generate:aggregate` only. `list`, `new`, `extend`, `validate`, `explain --raw` and `mcp` never call a model.

The CLI walks up from the working directory to find `package.json`, and honours `sourceRoot` from `nest-cli.json` when one is present.

## Scaffolding

```bash
ddd new value-object OrderTotal --kind number  # → shared/valueobjects/order-total.ts
ddd new validator OrderTotalRules --for OrderTotal
ddd new event OrderPlaced                      # → OrderPlacedEvent, with fromJSON for replay
ddd new exception OrderClosed                  # → OrderClosedException
ddd new aggregate Order
ddd new enum OrderStatus
```

No model is involved. These have one correct shape, taken from the library's own code, and every template passes `ddd validate`: a factory that checks `isValid` where the stereotype has one, an `addValidators()` that chains to `super` wherever the base actually registers rules, and events that carry primitives only.

Subclassing works against whatever the installed library reports as a base:

```bash
ddd extend --list
ddd extend AbstractRuleValidator OrderTotalRules
ddd extend DddValueObject Coordinates
```

Whatever the introspector reports as abstract becomes a stub, so this keeps working for a base the command has never heard of. Asking to extend something that is not a base explains the distinction — `ddd extend BrokenRulesManager Foo` answers that it is a collaborator an aggregate holds and delegates to, rather than one to subclass.

## Auditing

```bash
ddd validate            # the whole source root
ddd validate src/orders # or one path
ddd validate --strict   # fail on warnings too
```

| Rule                                  | Severity | Why it matters                                                                                                                                                                                 |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super-add-validators`                | error    | `StringValueObject`, `NumberValueObject` and `IdValueObject` register real validators in `addValidators()`. An override that does not chain drops them, and invalid values pass with no error. |
| `no-subclass-state-in-add-validators` | error    | The base constructor calls `addValidators()` before the subclass constructor body runs, so reading a field assigned there throws on every construction.                                        |
| `factory-checks-validity`             | warning  | Validation collects broken rules rather than throwing, so a `create()` that never checks `isValid` can hand back an object that failed its own invariants.                                     |
| `handler-commits-events`              | warning  | An aggregate collects its domain events; only `mergeObjectContext(...).commit()` dispatches them. Without it the command succeeds and every downstream handler is silently skipped.            |

Exit code is 1 when errors are found, 1 on warnings alone under `--strict`, and 0 when nothing is reported — so it can gate a build.

## Modelling an aggregate from prose

```bash
ddd generate:aggregate "An order has a customer name and a total. \
  The total must be positive and cannot exceed 1,000,000."
```

The model never writes TypeScript. It reads the prose and returns a specification, the specification is parsed against a zod schema, and deterministic renderers turn it into files. The same spec always produces the same bytes, and a provider that drifts fails on the parse rather than emitting code that does not compile.

From a spec with one value object, one event, one command and one aggregate invariant, the renderers emit 14 files:

```
order/order.module.ts                                            CqrsModule imported, handlers registered
order/domain/order-aggregate/order.ts                            extends DddAggregateRoot
order/domain/order-aggregate/validators/order-invariants.validator.ts
order/domain/order-aggregate/events/order-placed.ts              extends AbstractDomainEvent
order/application/use-cases/place-order/place-order.command.ts
order/application/use-cases/place-order/place-order.command-handler.ts
order/infrastructure/repositories/order.repository.ts            in-memory, ready to swap
shared/valueobjects/order-total.ts                               extends NumberValueObject
shared/valueobjects/validators/order-total-rules.validator.ts    extends AbstractRuleValidator
```

plus an `index.ts` barrel in five of them -- the aggregate folder, its `events/` and `validators/`, and `shared/valueobjects/` and its `validators/`. The module root, the use-case folder and `infrastructure/repositories/` get none. As with `ddd new`, the full file list is previewed and confirmed (`Write these files? (y/N)`) before anything lands, and existing files are reported as `exists` and left untouched unless you pass `--force`.

| Flag                  | Effect                                      |
| --------------------- | ------------------------------------------- |
| `-p, --provider <id>` | `anthropic` or `openai`                     |
| `-m, --model <id>`    | Override the provider's default model       |
| `-d, --dry-run`       | Show what would be generated, write nothing |
| `-f, --force`         | Overwrite files that already exist          |
| `-y, --yes`           | Skip the confirmation prompt                |

`anthropic` defaults to `claude-opus-5` and accepts `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or an `ANTHROPIC_PROFILE`; `openai` defaults to `gpt-5` and reads `OPENAI_API_KEY`. Whichever credential is present is picked automatically, Anthropic first.

## Driving it from an AI agent

If you already work inside an agent, it has a model and credentials; a second set for this CLI is redundant. Register it as an MCP server instead:

```bash
claude mcp add ddd -- npx -y @nestjslatam/ddd-cli mcp
# any other client: {"mcpServers":{"ddd":{"command":"npx","args":["-y","@nestjslatam/ddd-cli","mcp"]}}}
```

Seven tools become available, and no API key is involved: `ddd_list`, `ddd_describe`, `ddd_new`, `ddd_extend`, `ddd_validate`, `ddd_aggregate_schema` and `ddd_render_aggregate`. The last two are the division of labour — the agent decides aggregate boundaries, which concepts deserve value objects and what the invariants are; the CLI renders the result deterministically, and a spec that fails the schema comes back with per-field issues so the agent can correct itself.

Nothing is written unless a call passes `write: true`, and even then existing files come back under `skippedBecauseTheyExist` rather than being overwritten. MCP is JSON-RPC over stdout, so `ddd mcp` prints nothing of its own and silences the NestJS logger: one stray line corrupts the stream and the client drops the connection.

## Known limitations

- **`ddd extend` refuses `StringValueObject`, `NumberValueObject` and `IdValueObject`.** The introspector classifies all three as `use`, so `ddd extend StringValueObject OrderCode` fails with "StringValueObject is meant to be called directly, not subclassed" — even though they are the natural bases for a value object. Use `ddd new value-object <Name> --kind string|number`, which does emit a subclass of them.
- **The generated repository is in-memory.** A `Map` behind `save`, `findById`, `findAll`, `delete` and `exists`. The signature is what the handlers depend on; replacing the internals is left to you.
- **`ddd validate` is not a linter.** Four rules and nothing else. It will not tell you an aggregate is doing too little, or that your boundaries are wrong.
- **Over MCP, files are never overwritten, and there is no way to ask for it.** The CLI's `--force` has no MCP equivalent, by design.
- **Default model ids are compiled in.** When a provider retires or renames a model, pass `--model` until a release catches up.
- **`ddd new validator` without `--for` types the validator against `unknown`.** It warns, and generates anyway.
- **The write preview mislabels two stereotypes.** `ddd new exception` reports its file as `validator` and `ddd new enum` reports its file as `value-object`. Cosmetic only: the paths and file contents are correct.

## Development

```bash
npm install
npm test          # 54 tests, 6 suites
npm run type-check
npm run build
npm run robot     # acceptance suite
```

The unit suite checks the pieces; the robot checks the product. It builds a throwaway NestJS project with a real `@nestjslatam/ddd-lib` installed, then drives the built binary as a subprocess across every command, the flags that do not need a live model, and the error paths — running `tsc --noEmit` over what was scaffolded. That is what caught an event template that passed its unit test and then failed to compile, because `DomainEvent` already exposes `aggregateId` and the template redeclared it. Scenarios needing a live model are reported as skipped, never as passing. `ROBOT_JSON=report.json` writes a machine-readable report; `ROBOT_LIB_VERSION` pins the library version to test against.

CI runs lint, `tsc --noEmit`, the unit suite and a build on Node 20.x and 22.x, then packs the tarball and installs it into a clean project to prove the published artifact runs; the robot is its own workflow. Publishing is driven by a `v*` tag, checked against the manifest version first. Commits follow Conventional Commits; open an [issue](https://github.com/nestjslatam/ddd-cli/issues) before a large change.

## More

- [CHANGELOG.md](CHANGELOG.md) — what changed in each release, including why MCP was added alongside the CLI's own model connection rather than in place of it. The direct-API providers remain.
- [nestjslatam/ddd](https://github.com/nestjslatam/ddd) — the library this CLI introspects and generates against.

## License

MIT — [`LICENSE`](LICENSE) and `package.json` now agree, as does the copy shipped inside the npm tarball.

They did not until this was settled. `package.json` had always declared `MIT`, but the `LICENSE` beside it was the GNU General Public License v3 — unmodified boilerplate, with the copyright holder never filled in, which is what a template default looks like rather than a decision. The two shipped together in the same tarball, and GPL-3.0 is copyleft, so a consumer reading the `LICENSE` file rather than the manifest would have concluded this package imposed obligations the rest of the family does not.

**`0.2.0`, the version currently on npm, still ships the GPL file.** A published tarball cannot be amended in place; the correction reaches consumers with the next release.
