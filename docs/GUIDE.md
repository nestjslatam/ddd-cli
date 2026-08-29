# The `ddd` CLI — a working guide

Every command, every flag, and every piece of output on this page was produced by running the CLI against `@nestjslatam/ddd-lib@3.0.0`. Nothing here is illustrative.

We build one thing from nothing: the **cargo shipping** domain from Eric Evans' book, chosen because it is a genuine object graph rather than a single class — a `Cargo` aggregate holding a route specification, a voyage, weights and locations, emitting events, guarded by validators. By the end there are ten files, and `tsc --noEmit` passes on all of them without a line being hand-edited.

**Contents**

1. [Install](#1-install)
2. [Orient yourself: `ddd list`](#2-orient-yourself-ddd-list)
3. [Read a contract: `ddd explain`](#3-read-a-contract-ddd-explain)
4. [Build the graph: `ddd new`](#4-build-the-graph-ddd-new)
5. [Subclass anything: `ddd extend`](#5-subclass-anything-ddd-extend)
6. [Catch what the compiler cannot: `ddd validate`](#6-catch-what-the-compiler-cannot-ddd-validate)
7. [Hand it to an AI agent: `ddd mcp`](#7-hand-it-to-an-ai-agent-ddd-mcp)
8. [Model from prose: `ddd generate:aggregate`](#8-model-from-prose-ddd-generateaggregate)
9. [Command reference](#9-command-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Install

```bash
npm install @nestjslatam/ddd-lib @nestjs/cqrs
npm install -D @nestjslatam/ddd-cli
```

`@nestjs/cqrs` is not optional — `DddAggregateRoot` extends its `AggregateRoot`.

The CLI needs no API key for anything in sections 2 to 7. Only `generate:aggregate` and `explain` without `--raw` call a model, and even those do not when you drive the CLI from an agent over MCP.

**It reads your project, not its own assumptions.** It walks up from the working directory to find `package.json`, honours `sourceRoot` from `nest-cli.json` when present, and parses the `.d.ts` of the `ddd-lib` **you** have installed with the TypeScript compiler API. Ask it about a version it has never seen and it answers correctly.

---

## 2. Orient yourself: `ddd list`

Before writing anything, find out what the library actually offers.

```bash
npx ddd list
```

The header is the important part, and it is the thing most people get wrong about this library:

```
  extend     subclass it
  implement  satisfy the interface
  compose    the aggregate delegates to it
  use        call it directly
```

Sixty-six symbols follow, grouped by family. Filter to make it useful:

```bash
npx ddd list --family value
```

```
  Value Objects
  extend     DddValueObject            extends AbstractNotifyPropertyChanged · implement getEqualityComponents
  use        DEFAULT_NUMBER_OPTIONS
  extend     IdValueObject             extends DddValueObject
  extend     NumberValueObject         extends DddValueObject
  implement  NumberValueObjectOptions
  extend     StringValueObject         extends DddValueObject
  implement  StringValueObjectOptions

  7 symbols · ddd explain <name> for any of them
```

### The `compose` list is the one to read first

```bash
npx ddd list --role compose
```

```
  Aggregates
  compose    AggregateValidationOrchestrator

  Validation & Business Rules
  compose    BrokenRulesExtension
  compose    BrokenRulesManager
  compose    NotifyPropertyChangedContext
  compose    ValidatorRuleManager

  State & Tracking
  compose    NestedPropertyChangeDetector
  compose    StateTransitionManager
  compose    TrackingStateManager

  8 symbols · ddd explain <name> for any of them
```

These eight are **collaborators your aggregate already holds** — `aggregate.brokenRules`, `aggregate.validators`, `aggregate.trackingState`. They are not base classes. Trying to subclass one is the most common wrong turn, and the CLI will stop you (see [Troubleshooting](#10-troubleshooting)).

`--family` accepts `validation`, `value`, `aggregate`, `event`. `--role` accepts `extend`, `implement`, `compose`, `use`. They combine.

---

## 3. Read a contract: `ddd explain`

```bash
npx ddd explain StringValueObject --raw
```

`--raw` prints the declaration and its documentation with **no model involved** — instant, free, and exactly what your installed version says:

```
  class StringValueObject extends DddValueObject
  valueobjects/string.valueobject.d.ts · Value Objects · extend

  Base value object for representing string values in the domain.
  Provides configurable validation and utility methods for working with text.

  @remarks
  This class follows the Factory Method pattern with protected constructor.
  By default, it validates that strings are not null, undefined, or empty.
  Validation behavior can be customized through configuration options.
  ...
```

Without `--raw` the CLI asks a model to explain it in context, which needs a provider. Use `--raw` in a loop; use the model when you are genuinely stuck.

---

## 4. Build the graph: `ddd new`

Six stereotypes: `value-object`, `validator`, `event`, `exception`, `aggregate`, `enum`.

### Look before you write

```bash
npx ddd new value-object TrackingId --dry-run
```

```
  Files under src
  create  shared/valueobjects/tracking-id.ts  value-object

  1 new · 0 already present
  Dry run: nothing was written.
```

Without `--dry-run` you get the same preview and a `y/N` prompt. `-y` skips it — use that in scripts, not while learning. **Existing files are never overwritten** unless you pass `--force`.

### The identity of a cargo

```bash
npx ddd new value-object TrackingId -y
npx ddd new value-object UnLocode -y
npx ddd new value-object GrossWeight --kind number -y
```

`--kind number` picks `NumberValueObject` as the base instead of `StringValueObject`. Here is what the last one produced, unedited:

```ts
import {
  NumberValueObject,
  NumberNotNullValidator,
} from '@nestjslatam/ddd-lib';

/**
 * TODO: describe what GrossWeight means in your domain.
 */
export class GrossWeight extends NumberValueObject {
  constructor(value: number) {
    super(value);
  }

  /**
   * The library collects broken rules rather than throwing, so a factory has
   * to check isValid itself. Skipping that check is how invalid values reach
   * an aggregate.
   */
  static create(value: number): GrossWeight {
    const instance = new GrossWeight(value);

    if (!instance.isValid) {
      const errors = instance.brokenRules.getBrokenRules();
      throw new Error(
        `Invalid GrossWeight: ${errors.map((error) => error.message).join(', ')}`,
      );
    }

    return instance;
  }

  /** Rehydrates without validating: the value is already known to be sound. */
  static load(value: number): GrossWeight {
    return new GrossWeight(value);
  }

  override addValidators(): void {
    // Dropping this super call silently discards the base's own rules.
    super.addValidators();
    this.validatorRules.add(new NumberNotNullValidator(this));
    // TODO: add a rule validator for this value object's own invariants.
  }
}
```

Three things are worth noticing, because they are the three mistakes this library makes easy:

- `create()` **checks `isValid`**. Validation collects broken rules rather than throwing, so a factory that skips this check returns objects that failed their own invariants.
- `addValidators()` **calls `super`**. The base registers real rules there; an override that does not chain drops them silently.
- `load()` exists and does _not_ validate — rehydrating from storage is not the same operation as creating.

The `TODO`s mark what only you can decide. Everything else is already correct.

### Rules of their own

```bash
npx ddd new validator GrossWeightRules --for GrossWeight -y
```

`--for` names the type being audited, which the template needs for its generic parameter and its import:

```ts
import { AbstractRuleValidator } from '@nestjslatam/ddd-lib';
import { GrossWeight } from '../gross-weight';

/**
 * Invariants for GrossWeight.
 *
 * Each condition is written to be TRUE when the rule is BROKEN -- the opposite
 * of how an assertion reads.
 */
export class GrossWeightRules extends AbstractRuleValidator<GrossWeight> {
  constructor(subject: GrossWeight) {
    super(subject);
  }

  public addRules(): void {
    // TODO: state the invariants.
    // if (condition) {
    //   this.addBrokenRule('property', 'Message for the caller');
    // }
  }
}
```

That comment about inverted conditions is not decoration. `addRules` records what is **wrong**, so every condition reads backwards from an assertion. Getting this backwards produces a validator that passes exactly when it should fail.

### The rest of the graph

```bash
npx ddd new aggregate Cargo -y
npx ddd new event CargoRouted -y
npx ddd new enum TransportMode -y
npx ddd new exception CargoMisrouted -y
```

```
  create  cargo/domain/cargo-aggregate/cargo.ts     aggregate
  create  domain/events/cargo-routed-event.ts       domain-event
  create  shared/enums/transport-mode.ts            enum
  create  shared/exceptions/cargo-misrouted-exception.ts  exception
```

Each line ends with what the file **is**. Check that column before confirming — it is the CLI telling you how it interpreted your request.

---

## 5. Subclass anything: `ddd extend`

`new` covers the six stereotypes people reach for most. `extend` covers **everything else**, including bases the CLI has never seen, because it derives the contract from the installed declarations rather than from a template.

```bash
npx ddd extend --list
```

lists what can be extended. Then:

```bash
npx ddd extend IdValueObject VoyageNumber -D cargo/domain -y
```

```
  VoyageNumber extends IdValueObject

  create  cargo/domain/voyage-number.ts  value-object

  ✓ 1 file(s) written
```

`-D` / `--directory` places the file relative to your source root. The kind reported — `value-object` — is derived from what `IdValueObject` inherits, not from its name, so it stays right for a base you wrote yourself.

Every abstract member of the base is stubbed, with its real signature, including generic parameters resolved against their constraints.

---

## 6. Catch what the compiler cannot: `ddd validate`

This is the command that earns the tool its place. Four rules, each a mistake that produces **no compiler error and no runtime exception** — just silently wrong behaviour.

Here is a `RouteSpecification` written the way people actually write one the first time:

```ts
export class RouteSpecification extends StringValueObject {
  private deadline: Date;

  constructor(value: string, deadline: Date) {
    super(value);
    this.deadline = deadline;
  }

  static create(value: string, deadline: Date): RouteSpecification {
    return new RouteSpecification(value, deadline);
  }

  override addValidators(): void {
    this.validatorRules.add(new RouteRules(this));
    if (this.deadline < new Date()) {
      this.validatorRules.add(new RouteRules(this));
    }
  }
}
```

It compiles. It is broken three ways.

```bash
npx ddd validate
```

```
  src/cargo/domain/route-specification.ts

  warning    19  RouteSpecification.create() never checks isValid
              Validation collects broken rules instead of throwing, so this
              factory can return an object that failed its own invariants.
              factory-checks-validity

  error      23  RouteSpecification.addValidators() does not call super.addValidators()
              The base adds its own rules there. Without the super call they are
              dropped, and invalid values pass validation with no error raised.
              super-add-validators

  error      25  addValidators() reads this.deadline, which the constructor assigns after super()
              The base constructor calls addValidators() before the subclass
              constructor body runs, so this.deadline is still undefined and
              construction throws every time.
              no-subclass-state-in-add-validators


  2 errors · 1 warning
```

Exit code `1`, so it gates a pipeline.

The third finding is the one worth dwelling on. `this.deadline` is assigned in the constructor body, but the **base constructor calls `addValidators()` before that body runs** — so it is `undefined` at that moment and every construction throws. This is not hypothetical: it is exactly how `NumberValueObject` shipped broken through two releases of `ddd-lib` itself.

### The fourth rule

`handler-commits-events` catches a CQRS handler that mutates an aggregate without `mergeObjectContext(...).commit()`. An aggregate _collects_ its domain events; only that call dispatches them. Without it the command succeeds, returns cleanly, and every downstream handler is silently skipped.

### And the migration check

`validate` also reads how **your installed version** declares `isValid` and reports every mismatched call site:

```
error  3  Order.create() calls isValid(), but the installed library declares it as a getter
```

`ddd-lib` 3.0.0 made `isValid` a getter on every base. For TypeScript the compiler finds these (`TS6234`); for JavaScript consumers this is the only mechanical way to find them.

### Fixed

```ts
export class RouteSpecification extends StringValueObject {
  static create(value: string): RouteSpecification {
    const spec = new RouteSpecification(value);
    if (!spec.isValid) {
      throw new Error(
        spec.brokenRules
          .getBrokenRules()
          .map((r) => r.message)
          .join(', '),
      );
    }
    return spec;
  }

  override addValidators(): void {
    super.addValidators();
    this.validatorRules.add(new RouteRules(this));
  }
}
```

The deadline moved out of the value object entirely — a constructor parameter that a validator needs cannot be read during `addValidators()`, so it belongs on the aggregate that composes this one.

```bash
npx ddd validate
```

```
  ✓ No idiom violations found.
```

`--strict` makes warnings fail too. In CI, that is usually what you want.

### The whole graph, type-checked

Ten files, none hand-edited beyond the `RouteSpecification` shown above:

```
src/cargo/domain/cargo-aggregate/cargo.ts
src/cargo/domain/route-specification.ts
src/cargo/domain/voyage-number.ts
src/domain/events/cargo-routed-event.ts
src/shared/enums/transport-mode.ts
src/shared/exceptions/cargo-misrouted-exception.ts
src/shared/valueobjects/gross-weight.ts
src/shared/valueobjects/tracking-id.ts
src/shared/valueobjects/un-locode.ts
src/shared/valueobjects/validators/gross-weight-rules.ts
```

```bash
npx tsc --noEmit    # exit 0
```

---

## 7. Hand it to an AI agent: `ddd mcp`

If you already work inside Claude Code, Codex or Cursor, that agent has a model and credentials. The CLI does not need its own.

```bash
claude mcp add ddd -- npx -y @nestjslatam/ddd-cli mcp
```

```jsonc
// any other MCP client
{
  "mcpServers": {
    "ddd": { "command": "npx", "args": ["-y", "@nestjslatam/ddd-cli", "mcp"] },
  },
}
```

Seven tools appear, with **no API key**:

```
  ddd_list                 Inventory every stereotype exported by the installed library
  ddd_describe             The real type declaration of one stereotype
  ddd_new                  Generate a stereotype from a deterministic template
  ddd_extend               Scaffold a subclass of any base, stubbing every abstract member
  ddd_validate             Check TypeScript against the four idiom rules
  ddd_aggregate_schema     The JSON Schema an aggregate model must satisfy
  ddd_render_aggregate     Turn an aggregate specification into a full set of files
```

**The division of labour is the point.** The agent decides the aggregate boundary, the invariants and the naming — judgement. The CLI does what a model is bad at: reading the installed declarations exactly, rendering deterministically, and auditing against the idiom.

`ddd_describe` deliberately returns facts rather than prose; the agent writes the explanation, which is what it is for. `ddd_aggregate_schema` and `ddd_render_aggregate` make the split explicit — the agent produces a specification, the CLI renders it, and a specification that fails the schema comes back with per-field issues so the agent corrects itself without a human in the loop.

**Nothing reaches disk unless a call passes `write: true`**, and even then existing files are never overwritten. An agent working unattended must not clobber hand-edited domain code.

### A prompt that works

> Read the `ddd-lib` I have installed, then model a Cargo aggregate for a shipping domain: a tracking id, a route specification with origin and destination, a gross weight, and a current voyage. Validate what you write before you show me.

The agent will call `ddd_list`, `ddd_describe`, `ddd_aggregate_schema`, `ddd_render_aggregate` and `ddd_validate` in whatever order it needs.

---

## 8. Model from prose: `ddd generate:aggregate`

The one command that needs a model of its own.

```bash
export ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY
npx ddd generate:aggregate "A cargo has a tracking id, a route from an origin to a destination, and a gross weight in kilograms. The weight must be positive and no more than 30000. A cargo cannot be routed twice." --dry-run
```

It produces the aggregate root, its props interface, its validators and its events — then you review the preview before anything is written. `--provider` picks `anthropic` or `openai`; `--model` overrides the default.

**If you already work in an agent, do not use this command.** Use MCP (section 7): the agent's own model does the modelling, you need no second set of credentials, and you can iterate conversationally.

Its output is the only non-deterministic thing the CLI produces. Run `ddd validate` on the result — the CLI checks its own homework.

---

## 9. Command reference

| Command                            | Alias   | Needs a model        | Key flags                                                                |
| ---------------------------------- | ------- | -------------------- | ------------------------------------------------------------------------ |
| `ddd list`                         | `ls`    | No                   | `--family <f>`, `--role <r>`                                             |
| `ddd explain <symbol>`             | `why`   | Only without `--raw` | `--raw`, `--provider`, `--model`                                         |
| `ddd new <kind> <Name>`            | `n`     | No                   | `--kind string\|number`, `--for <type>`, `--dry-run`, `--force`, `--yes` |
| `ddd extend <Base> <Name>`         | `x`     | No                   | `--directory <path>`, `--list`, `--dry-run`, `--force`, `--yes`          |
| `ddd validate [path]`              | `check` | No                   | `--strict`                                                               |
| `ddd generate:aggregate "<prose>"` | `ga`    | **Yes**              | `--provider`, `--model`, `--dry-run`, `--force`, `--yes`                 |
| `ddd mcp`                          | —       | No                   | —                                                                        |

`new` stereotypes: `value-object`, `validator`, `event`, `exception`, `aggregate`, `enum`.

Exit codes: `0` clean, `1` violations found or command failed. `validate` is safe to put in CI as-is.

---

## 10. Troubleshooting

**"X is not a base class"**

```
  Error  BrokenRulesManager is not a base class.

  BrokenRulesManager is a collaborator: an aggregate or value object holds one
  and delegates to it, rather than subclassing it.

  Run `ddd list --role extend` to see what can be extended.
```

Working as intended. `compose` symbols are held, not subclassed — your aggregate already has `brokenRules`, `validators` and `trackingState`.

**A typo in a symbol name**

```
  Error  No symbol named "DddAgregateRoot" in @nestjslatam/ddd-lib.

  Did you mean: DddAggregateRoot?
```

**`ddd list` shows a version I do not expect.** It reads the `ddd-lib` resolved from your working directory. Outside a project it falls back to the copy bundled with the CLI. Run it from inside your project.

**Files were written where I did not expect.** The CLI honours `sourceRoot` from `nest-cli.json`. Without that file it assumes `src`. Use `--dry-run` first, always — the preview shows the exact paths.

**`validate` reports nothing on a file I know is wrong.** It parses TypeScript; check the path argument, and note that it audits `src` by default. Pass a path explicitly to widen or narrow it.

---

## Where to go next

- [`@nestjslatam/ddd-lib`](https://github.com/nestjslatam/ddd) — the library this tool reads
- [`@nestjslatam/ddd-valueobjects`](https://github.com/nestjslatam/ddd-valueobjects) — ready-made value objects, so you scaffold fewer
- [`@nestjslatam/ddd-es-lib`](https://github.com/nestjslatam/ddd-event-sourcing) — event sourcing, if your aggregates need replay
- [CHANGELOG](../CHANGELOG.md) — every release and why

---

<div align="center">

**Powered by [BeyondNetCode](https://beyondnet.info/)**

[Website](https://beyondnet.info/) · [GitHub](https://github.com/beyondnetcode) · [NestJS Latam](https://nestjslatam.dev/)

</div>
