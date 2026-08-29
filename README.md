<div align="center">

# `@nestjslatam/ddd-cli`

**Understand, scaffold and audit [`@nestjslatam/ddd-lib`](https://github.com/nestjslatam/ddd) — from your terminal, or from the AI agent you already use.**

[![npm](https://img.shields.io/npm/v/%40nestjslatam%2Fddd-cli?color=1e73be&label=ddd-cli)](https://www.npmjs.com/package/@nestjslatam/ddd-cli)
[![CI](https://github.com/nestjslatam/ddd-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/nestjslatam/ddd-cli/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-80%20unit%20%2B%2051%20acceptance-00d084)](#tests-and-the-robot)
[![no api key](https://img.shields.io/badge/API%20key-not%20required-00d084)](#driving-it-from-an-ai-agent)
[![license](https://img.shields.io/badge/license-MIT-575760)](LICENSE)

[**Full guide**](docs/GUIDE.md) · [Why](#why) · [Commands](#commands) · [MCP](#driving-it-from-an-ai-agent) · [FAQ](#faq) · [Contributing](#contributing)

</div>

---

```bash
npm install -D @nestjslatam/ddd-cli
```

> [!TIP]
> **[Read the full guide →](docs/GUIDE.md)** — every command and flag, walked through by building the cargo-shipping domain from nothing into ten type-checking files. Every line of output on that page was produced by running the CLI, not written from memory.

## Why

Most scaffolding CLIs hardcode a template and hope it still matches the library. This one **reads the `.d.ts` files of the `ddd-lib` installed in your project** with the TypeScript compiler API. Ask it about `DddAggregateRoot` and it describes _your_ version — including a version it has never seen, and including a base you added to your own fork.

```bash
npx ddd list
```

```
  extend     subclass it
  implement  satisfy the interface
  compose    the aggregate delegates to it
  use        call it directly

  Aggregates
  compose    AggregateValidationOrchestrator
  extend     DddAggregateRoot                 extends AggregateRoot

  Value Objects
  extend     DddValueObject            extends AbstractNotifyPropertyChanged · implement getEqualityComponents
  extend     IdValueObject             extends DddValueObject
  extend     NumberValueObject         extends DddValueObject
  …
  66 symbols · ddd explain <name> for any of them
```

That four-way split is most of what there is to understand about the design. `compose` is the one people get wrong: `BrokenRulesManager`, `ValidatorRuleManager` and `TrackingStateManager` are collaborators an aggregate _holds_, not bases you subclass.

## Commands

| Command                            | What it does                                                            | Uses a model? |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------- |
| `ddd list`                         | Every stereotype, grouped, with its role                                | No            |
| `ddd explain <name>`               | One symbol: contract, what to implement, an example                     | Optional      |
| `ddd new <kind> <Name>`            | Scaffold a value object, validator, event, exception, aggregate or enum | No            |
| `ddd extend <Base> <Name>`         | Subclass any base, with the abstract members stubbed                    | No            |
| `ddd validate`                     | Audit your code against four idiom rules                                | No            |
| `ddd generate:aggregate "<prose>"` | Model an aggregate from a description                                   | **Yes**       |
| `ddd mcp`                          | Run as an MCP server for an AI agent                                    | No            |

Five of the seven never touch a model.

### Scaffolding

```bash
npx ddd new value-object OrderTotal --kind number
npx ddd new validator OrderTotalRules --for OrderTotal
npx ddd extend AbstractRuleValidator ShippingRules
```

`extend` derives the contract from the installed declarations, so it works for bases it has never seen. **Nothing is written before you see the file list and confirm** — the preview names the path and what each file is:

```
  Sku extends StringValueObject

  Files under src
  create  shared/valueobjects/sku.ts  value-object

  1 new · 0 already present
  Write this file? (y/N)
```

Everything `ddd new` emits **passes `ddd validate`**. The templates are not merely plausible; they satisfy the tool's own audit.

Point it at something that is not a base class and it teaches rather than errors:

```
  BrokenRulesManager is not a base class.

  BrokenRulesManager is a collaborator: an aggregate or value object holds
  one and delegates to it, rather than subclassing it.

  Run `ddd list --role extend` to see what can be extended.
```

### Auditing

```bash
npx ddd validate
```

Four rules, each a mistake `ddd-lib` makes easy and silent:

| Rule                                  | Catches                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `no-subclass-state-in-add-validators` | Reading a subclass field inside `addValidators()`, which the base constructor calls _before_ your constructor body runs |
| `super-add-validators`                | An override that does not chain, dropping the base's real validators                                                    |
| `factory-checks-validity`             | A `create()` that never checks `isValid`, so invalid objects escape                                                     |
| `handler-commits-events`              | A handler without `mergeObjectContext(...).commit()`, so no event is ever dispatched                                    |

The first is not hypothetical: it is exactly how `NumberValueObject` shipped broken through two releases of the library.

`validate` also reports **`isValid` call sites that do not match your installed version** — a getter since `ddd-lib` 3.0.0. That is the mechanical part of the 2.x → 3.0.0 migration:

```
error  3  Order.create() calls isValid(), but the installed library declares it as a getter
```

## Driving it from an AI agent

If you already work in Claude Code, Codex or Cursor, that agent has a model and credentials. The CLI does not need its own.

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

Seven tools, **no API key**: `ddd_list`, `ddd_describe`, `ddd_new`, `ddd_extend`, `ddd_validate`, `ddd_aggregate_schema`, `ddd_render_aggregate`.

The division of labour is the point. **The agent decides** the aggregate boundary, the invariants, the naming — judgement. **The CLI does** what a model is bad at: reading the installed declarations exactly, rendering deterministically, and auditing against the idiom. `ddd_describe` returns facts rather than prose on purpose; the agent writes the explanation, which is what it is for.

`ddd_aggregate_schema` and `ddd_render_aggregate` make the split explicit: the agent produces a specification, the CLI renders it, and a spec that fails the schema comes back with per-field issues so the agent corrects itself without a human in the loop.

Nothing reaches disk unless a call passes `write: true`, and even then existing files are never overwritten — an agent acting unattended must not clobber hand-edited domain code.

## Tests and the robot

```bash
npm test        # 80 unit tests, 8 suites
npm run robot   # 53 acceptance scenarios
```

The **acceptance robot** is what makes the claims above checkable. It builds a throwaway NestJS project, installs a real `@nestjslatam/ddd-lib` into it, and drives the _built binary as a subprocess_ across every command, flag and error path — then **type-checks the generated code** with `tsc`. Twelve of its scenarios speak MCP over stdio the way a real client does, including an assertion that nothing outside the protocol reaches stdout: MCP is JSON-RPC on that stream, and one stray log line makes a client drop the connection.

Unit tests never caught the two worst bugs this project has had. The robot did:

- generated mutate handlers referenced an unbound `id`, so every non-create handler failed `tsc`
- the event template redeclared `aggregateId`, a `TS2610` no unit test was looking for

CI additionally packs the real tarball and installs it into a clean project to prove the published artifact runs — including asserting the `ddd` binary actually got installed.

## FAQ

<details>
<summary><b>Do I need an Anthropic or OpenAI API key?</b></summary>

**No**, for everything except `ddd generate:aggregate` and `ddd explain --with-model`. `list`, `new`, `extend`, `validate` and `mcp` never contact a model. And over MCP even the modelling is done by _your agent's_ model, so a key is never needed there either.
</details>

<details>
<summary><b>Four <code>@nestjslatam</code> packages — which do I install?</b></summary>

[`ddd-lib`](https://github.com/nestjslatam/ddd) is the library and the only runtime dependency you need. This CLI is a **dev** dependency. [`ddd-valueobjects`](https://github.com/nestjslatam/ddd-valueobjects) and [`ddd-es-lib`](https://github.com/nestjslatam/ddd-event-sourcing) are optional add-ons.
</details>

<details>
<summary><b>If it runs as an MCP server, why is there still a standalone CLI?</b></summary>

Because CI has no agent. `ddd validate` in a pipeline is the reason the standalone binary exists, and it is the mode with no model in the loop at all — deterministic, exit-code driven.
</details>

<details>
<summary><b>Does <code>ddd list</code> report my <code>ddd-lib</code> version, or a table baked into the CLI?</b></summary>

Yours. It resolves `@nestjslatam/ddd-lib` from your project and parses its `.d.ts` with the TypeScript compiler API. Outside a project it falls back to its own bundled copy — `4.0.0` as of `0.4.0`.
</details>

<details>
<summary><b>What does this give me over writing the class myself?</b></summary>

For a value object, honestly not much — it is twenty lines. The value is in the parts that are easy to get _silently_ wrong: `extend` stubs the exact abstract members your installed version declares, and `validate` catches four mistakes that produce no error at all, just objects that quietly skip their own invariants.
</details>

<details>
<summary><b>Is <code>0.3.0</code> production-ready? What will bite me?</b></summary>

The CLI is pre-1.0 and its surface can move in any minor release, so pin an exact version.

The library it reads is a separate question: `@nestjslatam/ddd-lib@4.0.0` is the first release with tests on the classes you extend — 1017 of them, 98.6% coverage — and reaching that surfaced 34 defects. Its remaining risk is API churn rather than correctness. `ddd validate` is the tool for exactly that: it reads how _your_ installed version declares things and reports call sites that no longer match.

Known rough edges in the CLI itself: `ddd generate:aggregate` is the only command whose output is not deterministic, and the scaffold writes into a layout inferred from `nest-cli.json` — check the preview before confirming if your project is laid out unusually.
</details>

<details>
<summary><b>Will it work with my Node and NestJS version?</b></summary>

Node `>=20.11`; CI runs 20.x and 22.x. It is a dev tool, so it does not constrain your app's NestJS version — but `list`, `explain` and `extend` read the `ddd-lib` you have installed, and `ddd-lib` itself declares NestJS `^10 || ^11`.
</details>

## Contributing

Concrete work, verifiable in minutes:

1. **More `validate` rules.** The four are in [`src/validate/idiom-rules.ts`](src/validate/idiom-rules.ts); each is a small AST predicate with a test beside it. The library has more silent footguns than four.
2. **More `new` stereotypes.** [`src/scaffold/stereotype.renderer.ts`](src/scaffold/stereotype.renderer.ts) — repositories, sagas and command handlers are not covered.
3. **Robot scenarios for the gaps.** Two of the 53 are skipped because they need a live model; anything else missing is a gap worth filling.

Before opening a PR:

```bash
npm run lint && npm run type-check && npm test && npm run robot
```

CI runs all of it on Node 20 and 22, plus a tarball install check. Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## Requirements

Node `>=20.11`. Built with NestJS and [nest-commander](https://nest-commander.jaymcdoniel.dev/); the CLI is a real Nest application, so commands are injectable providers and testable as such.

## Who is behind this

Built and maintained by **[BeyondNet Tech](https://beyondnet.info/)** with the [NestJS Latam](https://nestjslatam.dev/) community.

- **[Evolith](https://github.com/beyondnetcode/evolith_arch32)** — executable architecture governance: a CLI, MCP server and REST API that check a repository against Rego/OPA rules, and report a rule they could not evaluate as a failure rather than a silent pass. The same idea as `ddd validate`, one level up.
- **[Shell.ddd](https://github.com/beyondnetcode/Shell.ddd)** — the .NET counterpart of `ddd-lib`.

## More

- [**The guide**](docs/GUIDE.md) — every command, every flag, one worked domain end to end
- [`nestjslatam/ddd`](https://github.com/nestjslatam/ddd) — the library this tool reads
- [CHANGELOG](CHANGELOG.md) — every release and why

## License

MIT — see [LICENSE](LICENSE). Note that `0.2.0` and earlier shipped a GPL-3.0 file by mistake; a published tarball cannot be amended in place, so upgrade rather than relying on the licence text in an older release.

---

<div align="center">

**Powered by [BeyondNetCode](https://beyondnet.info/)**

[Website](https://beyondnet.info/) · [GitHub](https://github.com/beyondnetcode) · [NestJS Latam](https://nestjslatam.dev/)

</div>
