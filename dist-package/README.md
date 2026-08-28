# @nestjslatam/ddd-cli

LLM-assisted generator for Domain-Driven Design artifacts built on [`@nestjslatam/ddd-lib`](https://www.npmjs.com/package/@nestjslatam/ddd-lib).

Describe a domain in plain language; get an aggregate root, its value objects, invariants, domain events, CQRS commands with handlers, a repository and a wired NestJS module.

```bash
ddd generate:aggregate "An order has a customer name and a total. \
  The total must be positive and cannot exceed 1,000,000."
```

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

## Development

```bash
npm install
npm test
npm run build
```

`DDD_CLI_DEBUG=1` restores full NestJS logging.

## License

MIT
