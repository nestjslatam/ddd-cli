# @nestjslatam/ddd-cli

LLM-assisted generator for Domain-Driven Design artifacts built on [`@nestjslatam/ddd-lib`](https://www.npmjs.com/package/@nestjslatam/ddd-lib).

Describe a domain in plain language; get an aggregate root, its value objects, invariants, domain events, CQRS commands with handlers, a repository and a wired NestJS module.

```bash
ddd generate:aggregate "An order has a customer name and a total. \
  The total must be positive and cannot exceed 1,000,000."
```

## Look and feel

Output follows the [nestjslatam.dev](https://nestjslatam.dev/) identity. The palette is the site's own design tokens, read from its stylesheet rather than approximated:

| Token | Colour | Used for |
|---|---|---|
| `--accent` | `#1e73be` | symbol names, commands, emphasis |
| `--contrast-2` | `#575760` | secondary text, provenance, hints |
| `--contrast-3` | `#b2b2be` | rules, dividers, the quietest detail |
| NestJS red | `#e0234e` | errors |

Success and warning (`#00d084`, `#fcb900`) come from the preset palette the site's theme ships; the brand defines no green or amber.

Primary text is deliberately left uncoloured. A terminal already has a foreground that suits its background, and `--contrast` (`#222222`) would be unreadable on a dark theme.

Colour degrades by terminal capability — 24-bit where `COLORTERM` advertises it, 256 colours, then the basic eight. `NO_COLOR`, `TERM=dumb` and piped output all produce plain text, so redirecting to a file stays clean.

## Understanding the library

```bash
ddd list                              # every stereotype, grouped, with its role
ddd list --family validation          # just the validators and business rules
ddd list --role extend                # only the base classes you subclass
ddd explain AbstractRuleValidator     # what it is, the contract, an example
ddd explain BrokenRulesManager --raw  # the declaration only, no model call
```

`list` needs no model at all. It reads the `.d.ts` files of the `@nestjslatam/ddd-lib` **installed in your project**, with the TypeScript compiler, and reports what is actually there — so it stays correct across library versions without the CLI being updated.

The output turns on a distinction that is most of understanding this library's design:

| Role | Meaning |
|---|---|
| `extend` | A base class you subclass. `ddd list` shows the abstract members you must implement. |
| `implement` | An interface you satisfy. |
| `compose` | A collaborator the aggregate **delegates to** rather than inheriting from — `BrokenRulesManager`, `ValidatorRuleManager`, `TrackingStateManager`. This is the decoupling. |
| `use` | Call it directly. |

`explain` adds a model to that, but the model only ever sees the real declaration: the signature, the abstract members, the JSDoc as published. It is told to say so when the declaration does not answer something rather than fill the gap, so it cannot describe an API that does not exist. The facts are printed before the explanation so you can tell them apart, and `--raw` skips the model entirely.

Aliased exports are resolved: `AbstractDomainEvent` is reported as an alias of `DomainEvent`, because they are the same class.

## Creating stereotypes

```bash
ddd new value-object OrderTotal --kind number
ddd new validator OrderTotalRules --for OrderTotal
ddd new event OrderPlaced          # OrderPlacedEvent, with fromJSON for replay
ddd new exception OrderClosed      # OrderClosedException
ddd new aggregate Order
ddd new enum OrderStatus
```

No model is involved. These have one correct shape, taken from how the library's own code is written, and a model would only add variance where none is wanted — `generate:aggregate` is where it earns its place, deciding *what* to build rather than how to spell it.

Every template carries the idiom `ddd validate` checks for: a factory that checks `isValid`, an `addValidators()` that chains to `super`, events that carry primitives only.

## Extending the library

```bash
ddd extend --list                                  # what can be subclassed
ddd extend AbstractRuleValidator OrderTotalRules
ddd extend DddValueObject Coordinates
```

The contract comes from the installed declarations, not a table in this CLI: whatever the introspector reports as abstract becomes a stub. That is what makes it work for a base this command has never heard of, and keeps it correct when the library adds one.

Asking to extend something that is not a base explains why, rather than refusing:

```
BrokenRulesManager is not a base class.

  BrokenRulesManager is a collaborator: an aggregate or value object holds one
  and delegates to it, rather than subclassing it.
```

## Auditing your code

```bash
ddd validate            # the whole source root
ddd validate src/orders # or one path
ddd validate --strict   # fail on warnings too
```

Four rules, each one a mistake this library makes easy and silent:

| Rule | Why it matters |
|---|---|
| `no-subclass-state-in-add-validators` | The base constructor calls `addValidators()` **before** the subclass constructor body runs. Reading a field assigned there throws on every construction — this is exactly how `NumberValueObject` shipped broken through two releases. |
| `super-add-validators` | `StringValueObject` and `NumberValueObject` register real validators in `addValidators()`. An override that does not chain drops them, and invalid values pass with no error. |
| `factory-checks-validity` | Validation collects broken rules rather than throwing, so a `create()` that does not check `isValid` can hand back an object that failed its own invariants. |
| `handler-commits-events` | An aggregate collects its domain events; only `mergeObjectContext(...).commit()` dispatches them. Without it the command succeeds and every downstream handler is silently skipped. |

Exits non-zero when errors are found, so it can gate a build.

## How it works

The model never writes TypeScript.

```
description ──▶ planner ──▶ AggregateSpec ──▶ renderers ──▶ files
                (LLM)        (validated)      (deterministic)
```

The model does the part it is genuinely good at — reading prose and proposing aggregate boundaries, value objects and invariants — and returns a structured specification. Deterministic renderers turn that specification into code.

That split is deliberate. It means:

- **The same spec always produces the same bytes.** Renderers are pure and unit-testable without a model.
- **A drifting provider fails loudly.** The response is parsed against a zod schema before anything is rendered, so a malformed model never becomes TypeScript that does not compile.
- **Several providers are viable.** Native constrained decoding is not uniform across vendors, so correctness cannot rest on the provider honouring a schema. It rests on the parse.

## Providers

| Provider | Default model | Credential |
|---|---|---|
| `anthropic` | `claude-opus-5` | `ANTHROPIC_API_KEY`, or an `ant auth login` profile |
| `openai` | `gpt-5` | `OPENAI_API_KEY` |

Auto-detected from whichever credential is present, Anthropic first. Override with `--provider` / `--model`.

Claude is called with structured outputs and adaptive thinking — deciding aggregate boundaries is judgement work that benefits from reasoning before answering. OpenAI uses `json_schema` with `strict: true`; the schema is hardened at call time, because strict mode requires every object to declare `additionalProperties: false` and list every key in `required`.

## Options

| Flag | Effect |
|---|---|
| `-p, --provider <id>` | `anthropic` or `openai` |
| `-m, --model <id>` | Override the provider's default model |
| `-d, --dry-run` | Show what would be generated, write nothing |
| `-f, --force` | Overwrite files that already exist |
| `-y, --yes` | Skip the confirmation prompt |

Nothing is written before you see the full file list and confirm. Existing files are reported but left alone unless you pass `--force` — overwriting hand-edited domain code is the one mistake a generator must not make quietly.

## What it generates

For an `Order` aggregate:

```
src/
  order/
    order.module.ts                                    NestJS module, CqrsModule imported,
                                                       handlers registered as providers
    domain/order-aggregate/
      order.ts                                         extends DddAggregateRoot
      validators/order-invariants.validator.ts          cross-property invariants
      events/order-placed-event.ts                     extends AbstractDomainEvent
    application/use-cases/place-order/
      place-order.command.ts
      place-order.command-handler.ts                   @CommandHandler, merges into the
                                                       publisher context and commits
    infrastructure/repositories/order.repository.ts    in-memory, ready to swap
  shared/valueobjects/
    order-total.ts                                     extends NumberValueObject
    validators/order-total-rules.validator.ts          extends AbstractRuleValidator
```

Register the emitted module in your application module and it runs.

## Requirements

Node 20.11 or later, and a project that depends on `@nestjslatam/ddd-lib`. The CLI walks up from the working directory to find `package.json`, and honours `sourceRoot` from `nest-cli.json`.

## The acceptance robot

```bash
npm run robot
```

The unit suite checks the pieces; the robot checks the product. It builds a throwaway NestJS project with a real `@nestjslatam/ddd-lib` installed, then drives the **built binary as a subprocess** — the way a user would — across 41 scenarios covering every command, every flag, and the error paths.

For scaffolding scenarios it does not merely check the output text: it runs `tsc` over what was written. That is what makes it worth having. The event template passed its unit test and then failed to compile, because `DomainEvent` already exposes `aggregateId` as an accessor and the template redeclared it. Only compiling the result surfaced that.

Scenarios needing a live model are **skipped and reported as skipped**, never as passing, when no credentials are present:

```
  39 passed, 0 failed, 2 skipped of 41

  Skipped (not tested, not passing):
    explain · explains against a live model — needs model credentials
    generate:aggregate · models an aggregate against a live model — needs model credentials
```

It exits non-zero on failure, so CI can gate on it. `ROBOT_JSON=report.json` writes a machine-readable report; `ROBOT_LIB_VERSION` pins which library version to test against, so a new release can be checked before it ships.

## Development

```bash
npm install
npm test
npm run build
```

`DDD_CLI_DEBUG=1` restores full NestJS logging.

## License

MIT
