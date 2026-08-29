# El CLI `ddd` — guía práctica

Cada comando, cada opción y cada línea de salida de esta página se produjo ejecutando el CLI contra `@nestjslatam/ddd-lib@3.0.0`. Nada de lo que hay aquí es ilustrativo.

> **La salida de terminal va en inglés**, que es el idioma en el que imprime la herramienta. Traducirla sería enseñarte algo que el CLI no dice.

Construimos una cosa desde cero: el dominio de **transporte marítimo** del libro de Eric Evans, elegido porque es un grafo de objetos de verdad y no una clase suelta — un agregado `Cargo` que contiene una especificación de ruta, un viaje, pesos y ubicaciones, que emite eventos y está protegido por validadores. Al final hay diez ficheros, y `tsc --noEmit` pasa sobre todos ellos sin que se haya editado una línea a mano.

**Contenido**

1. [Instalar](#1-instalar)
2. [Orientarse: `ddd list`](#2-orientarse-ddd-list)
3. [Leer un contrato: `ddd explain`](#3-leer-un-contrato-ddd-explain)
4. [Construir el grafo: `ddd new`](#4-construir-el-grafo-ddd-new)
5. [Heredar de cualquier cosa: `ddd extend`](#5-heredar-de-cualquier-cosa-ddd-extend)
6. [Cazar lo que el compilador no ve: `ddd validate`](#6-cazar-lo-que-el-compilador-no-ve-ddd-validate)
7. [Dárselo a un agente de IA: `ddd mcp`](#7-dárselo-a-un-agente-de-ia-ddd-mcp)
8. [Modelar desde prosa: `ddd generate:aggregate`](#8-modelar-desde-prosa-ddd-generateaggregate)
9. [Referencia de comandos](#9-referencia-de-comandos)
10. [Cuando algo no sale](#10-cuando-algo-no-sale)

---

## 1. Instalar

```bash
npm install @nestjslatam/ddd-lib @nestjs/cqrs
npm install -D @nestjslatam/ddd-cli
```

`@nestjs/cqrs` no es opcional — `DddAggregateRoot` extiende su `AggregateRoot`.

El CLI **no necesita ninguna clave de API** para nada de lo que hay entre las secciones 2 y 7. Sólo `generate:aggregate` y `explain` sin `--raw` llaman a un modelo, y ni siquiera esos lo hacen cuando manejas el CLI desde un agente por MCP.

**Lee tu proyecto, no sus propias suposiciones.** Sube desde el directorio de trabajo hasta encontrar `package.json`, respeta el `sourceRoot` de `nest-cli.json` si existe, y parsea los `.d.ts` del `ddd-lib` que **tú** tienes instalado con la API del compilador de TypeScript. Pregúntale por una versión que nunca ha visto y responde correctamente.

---

## 2. Orientarse: `ddd list`

Antes de escribir nada, averigua qué ofrece realmente la librería.

```bash
npx ddd list
```

La cabecera es la parte importante, y es justo lo que más gente entiende mal de esta librería:

```
  extend     subclass it
  implement  satisfy the interface
  compose    the aggregate delegates to it
  use        call it directly
```

Es decir: **extender** (heredas de ella), **implementar** (cumples la interfaz), **componer** (el agregado delega en ella) y **usar** (la llamas directamente).

Detrás vienen sesenta y seis símbolos, agrupados por familia. Filtra para que sea útil:

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

### La lista de `compose` es la primera que hay que leer

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

Esos ocho son **colaboradores que tu agregado ya tiene** — `aggregate.brokenRules`, `aggregate.validators`, `aggregate.trackingState`. No son clases base. Intentar heredar de uno es el desvío equivocado más común, y el CLI te para (ver [Cuando algo no sale](#10-cuando-algo-no-sale)).

`--family` acepta `validation`, `value`, `aggregate`, `event`. `--role` acepta `extend`, `implement`, `compose`, `use`. Se combinan.

---

## 3. Leer un contrato: `ddd explain`

```bash
npx ddd explain StringValueObject --raw
```

`--raw` imprime la declaración y su documentación **sin modelo de por medio** — instantáneo, gratis, y exactamente lo que dice tu versión instalada:

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

Sin `--raw`, el CLI le pide a un modelo que lo explique en contexto, lo que exige un proveedor. Usa `--raw` mientras trabajas; deja el modelo para cuando estés genuinamente atascado.

---

## 4. Construir el grafo: `ddd new`

Seis estereotipos: `value-object`, `validator`, `event`, `exception`, `aggregate`, `enum`.

### Mira antes de escribir

```bash
npx ddd new value-object TrackingId --dry-run
```

```
  Files under src
  create  shared/valueobjects/tracking-id.ts  value-object

  1 new · 0 already present
  Dry run: nothing was written.
```

Sin `--dry-run` obtienes la misma vista previa y una pregunta `y/N`. `-y` se la salta — úsalo en scripts, no mientras aprendes. **Los ficheros existentes no se sobrescriben nunca** salvo que pases `--force`.

### La identidad de un envío

```bash
npx ddd new value-object TrackingId -y
npx ddd new value-object UnLocode -y
npx ddd new value-object GrossWeight --kind number -y
```

`--kind number` elige `NumberValueObject` como base en lugar de `StringValueObject`. Esto es lo que produjo el último, sin editar:

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

Tres cosas merecen atención, porque son los tres errores que esta librería hace fáciles:

- `create()` **comprueba `isValid`**. La validación recolecta reglas rotas en lugar de lanzar, así que una fábrica que se salta esa comprobación devuelve objetos que incumplen sus propias invariantes.
- `addValidators()` **llama a `super`**. La base registra reglas reales ahí; un override que no encadena las descarta en silencio.
- `load()` existe y **no** valida — rehidratar desde almacenamiento no es la misma operación que crear.

Los `TODO` marcan lo que sólo tú puedes decidir. Todo lo demás ya está correcto.

### Reglas propias

```bash
npx ddd new validator GrossWeightRules --for GrossWeight -y
```

`--for` nombra el tipo que se audita, que la plantilla necesita para su parámetro genérico y su import:

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

Ese comentario sobre las condiciones invertidas no es decoración. `addRules` registra lo que está **mal**, así que cada condición se lee al revés de una aserción. Equivocarse aquí produce un validador que pasa exactamente cuando debería fallar.

### El resto del grafo

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

Cada línea acaba con lo que el fichero **es**. Revisa esa columna antes de confirmar — es el CLI diciéndote cómo interpretó tu petición.

---

## 5. Heredar de cualquier cosa: `ddd extend`

`new` cubre los seis estereotipos a los que la gente recurre más. `extend` cubre **todo lo demás**, incluidas bases que el CLI no ha visto nunca, porque deriva el contrato de las declaraciones instaladas y no de una plantilla.

```bash
npx ddd extend --list
```

lista lo que se puede extender. Después:

```bash
npx ddd extend IdValueObject VoyageNumber -D cargo/domain -y
```

```
  VoyageNumber extends IdValueObject

  create  cargo/domain/voyage-number.ts  value-object

  ✓ 1 file(s) written
```

`-D` / `--directory` coloca el fichero relativo a tu raíz de fuentes. El tipo que reporta —`value-object`— se deriva de lo que hereda `IdValueObject`, no de su nombre, así que sigue siendo correcto para una base que hayas escrito tú.

Cada miembro abstracto de la base queda esbozado, con su firma real, incluidos los parámetros genéricos resueltos contra sus restricciones.

---

## 6. Cazar lo que el compilador no ve: `ddd validate`

Éste es el comando que le gana su sitio a la herramienta. Cuatro reglas, cada una un error que **no produce error de compilación ni excepción en ejecución** — sólo comportamiento silenciosamente equivocado.

Aquí hay una `RouteSpecification` escrita como la escribe la gente la primera vez:

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

Compila. Y está mal de tres formas.

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

Código de salida `1`, así que sirve de puerta en un pipeline.

El tercer hallazgo es en el que vale la pena detenerse. `this.deadline` se asigna en el cuerpo del constructor, pero **el constructor base llama a `addValidators()` antes de que ese cuerpo se ejecute** — así que en ese momento es `undefined` y cada construcción lanza. No es hipotético: es exactamente cómo `NumberValueObject` se publicó roto durante dos versiones del propio `ddd-lib`.

### La cuarta regla

`handler-commits-events` caza un handler de CQRS que modifica un agregado sin `mergeObjectContext(...).commit()`. Un agregado **recolecta** sus eventos de dominio; sólo esa llamada los despacha. Sin ella, el comando triunfa, devuelve limpiamente, y todos los manejadores de abajo se saltan en silencio.

### Y la comprobación de migración

`validate` también lee cómo declara `isValid` **tu versión instalada** y señala cada llamada que no cuadra:

```
error  3  Order.create() calls isValid(), but the installed library declares it as a getter
```

`ddd-lib` 3.0.0 convirtió `isValid` en getter en todas las bases. Para TypeScript el compilador las encuentra (`TS6234`); para quien consume desde JavaScript, ésta es la única forma mecánica de encontrarlas.

### Arreglado

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

La fecha límite salió del value object por completo — un parámetro de constructor que un validador necesita no se puede leer durante `addValidators()`, así que su sitio es el agregado que compone a éste.

```bash
npx ddd validate
```

```
  ✓ No idiom violations found.
```

`--strict` hace que los avisos también fallen. En CI, suele ser lo que quieres.

### El grafo entero, con los tipos comprobados

Diez ficheros, ninguno editado a mano más allá de la `RouteSpecification` de arriba:

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

## 7. Dárselo a un agente de IA: `ddd mcp`

Si ya trabajas dentro de Claude Code, Codex o Cursor, ese agente tiene modelo y credenciales. El CLI no necesita los suyos.

```bash
claude mcp add ddd -- npx -y @nestjslatam/ddd-cli mcp
```

```jsonc
// cualquier otro cliente MCP
{
  "mcpServers": {
    "ddd": { "command": "npx", "args": ["-y", "@nestjslatam/ddd-cli", "mcp"] },
  },
}
```

Aparecen siete herramientas, **sin clave de API**:

```
  ddd_list                 Inventory every stereotype exported by the installed library
  ddd_describe             The real type declaration of one stereotype
  ddd_new                  Generate a stereotype from a deterministic template
  ddd_extend               Scaffold a subclass of any base, stubbing every abstract member
  ddd_validate             Check TypeScript against the four idiom rules
  ddd_aggregate_schema     The JSON Schema an aggregate model must satisfy
  ddd_render_aggregate     Turn an aggregate specification into a full set of files
```

**El reparto de trabajo es lo importante.** El agente decide la frontera del agregado, las invariantes y los nombres — criterio. El CLI hace lo que un modelo hace mal: leer las declaraciones instaladas con exactitud, renderizar de forma determinista y auditar contra el idioma.

`ddd_describe` devuelve hechos y no prosa a propósito; la explicación la escribe el agente, que para eso está. `ddd_aggregate_schema` y `ddd_render_aggregate` hacen el reparto explícito — el agente produce una especificación, el CLI la renderiza, y una especificación que no cumple el esquema vuelve con los problemas campo por campo, así que el agente se corrige solo sin que haya nadie mirando.

**Nada llega al disco salvo que una llamada pase `write: true`**, y aun así los ficheros existentes no se sobrescriben nunca. Un agente trabajando sin supervisión no debe pisar código de dominio escrito a mano.

### Un prompt que funciona

> Lee el `ddd-lib` que tengo instalado y modela un agregado Cargo para un dominio de transporte marítimo: un identificador de seguimiento, una especificación de ruta con origen y destino, un peso bruto y un viaje actual. Valida lo que escribas antes de enseñármelo.

El agente llamará a `ddd_list`, `ddd_describe`, `ddd_aggregate_schema`, `ddd_render_aggregate` y `ddd_validate` en el orden que necesite.

---

## 8. Modelar desde prosa: `ddd generate:aggregate`

El único comando que necesita un modelo propio.

```bash
export ANTHROPIC_API_KEY=...        # o OPENAI_API_KEY
npx ddd generate:aggregate "A cargo has a tracking id, a route from an origin to a destination, and a gross weight in kilograms. The weight must be positive and no more than 30000. A cargo cannot be routed twice." --dry-run
```

Produce la raíz del agregado, su interfaz de props, sus validadores y sus eventos — y después revisas la vista previa antes de que se escriba nada. `--provider` elige entre `anthropic` y `openai`; `--model` cambia el predeterminado.

**Si ya trabajas dentro de un agente, no uses este comando.** Usa MCP (sección 7): el modelo del propio agente hace el modelado, no necesitas un segundo juego de credenciales, y puedes iterar conversando.

Su salida es lo único no determinista que produce el CLI. Ejecuta `ddd validate` sobre el resultado — la herramienta corrige sus propios deberes.

---

## 9. Referencia de comandos

| Comando                            | Alias   | ¿Necesita modelo?    | Opciones principales                                                     |
| ---------------------------------- | ------- | -------------------- | ------------------------------------------------------------------------ |
| `ddd list`                         | `ls`    | No                   | `--family <f>`, `--role <r>`                                             |
| `ddd explain <símbolo>`            | `why`   | Sólo sin `--raw`     | `--raw`, `--provider`, `--model`                                         |
| `ddd new <tipo> <Nombre>`          | `n`     | No                   | `--kind string\|number`, `--for <tipo>`, `--dry-run`, `--force`, `--yes` |
| `ddd extend <Base> <Nombre>`       | `x`     | No                   | `--directory <ruta>`, `--list`, `--dry-run`, `--force`, `--yes`          |
| `ddd validate [ruta]`              | `check` | No                   | `--strict`                                                               |
| `ddd generate:aggregate "<prosa>"` | `ga`    | **Sí**               | `--provider`, `--model`, `--dry-run`, `--force`, `--yes`                 |
| `ddd mcp`                          | —       | No                   | —                                                                        |

Estereotipos de `new`: `value-object`, `validator`, `event`, `exception`, `aggregate`, `enum`.

Códigos de salida: `0` limpio, `1` violaciones encontradas o comando fallido. `validate` se puede poner en CI tal cual.

---

## 10. Cuando algo no sale

**«X is not a base class»**

```
  Error  BrokenRulesManager is not a base class.

  BrokenRulesManager is a collaborator: an aggregate or value object holds one
  and delegates to it, rather than subclassing it.

  Run `ddd list --role extend` to see what can be extended.
```

Funciona como debe. Los símbolos de `compose` se tienen, no se heredan — tu agregado ya dispone de `brokenRules`, `validators` y `trackingState`.

**Un nombre de símbolo con una errata**

```
  Error  No symbol named "DddAgregateRoot" in @nestjslatam/ddd-lib.

  Did you mean: DddAggregateRoot?
```

**`ddd list` muestra una versión que no esperaba.** Lee el `ddd-lib` que se resuelve desde tu directorio de trabajo. Fuera de un proyecto recurre a la copia que trae el propio CLI. Ejecútalo desde dentro de tu proyecto.

**Los ficheros se escribieron donde no esperaba.** El CLI respeta el `sourceRoot` de `nest-cli.json`. Sin ese fichero asume `src`. Usa `--dry-run` primero, siempre — la vista previa muestra las rutas exactas.

**`validate` no reporta nada en un fichero que sé que está mal.** Parsea TypeScript; comprueba el argumento de ruta, y ten en cuenta que audita `src` por defecto. Pasa una ruta explícita para ampliar o acotar.

---

## Por dónde seguir

- [`@nestjslatam/ddd-lib`](https://github.com/nestjslatam/ddd) — la librería que esta herramienta lee
- [`@nestjslatam/ddd-valueobjects`](https://github.com/nestjslatam/ddd-valueobjects) — value objects ya hechos, para andamiar menos
- [`@nestjslatam/ddd-es-lib`](https://github.com/nestjslatam/ddd-event-sourcing) — event sourcing, si tus agregados necesitan reproducirse
- [Documentación completa](https://docs.nestjslatam.dev) — la guía de la librería, en español
- [CHANGELOG](../CHANGELOG.md) — cada versión y su porqué

---

<div align="center">

**Impulsado por [BeyondNetCode](https://beyondnet.info/)**

[Web](https://beyondnet.info/) · [GitHub](https://github.com/beyondnetcode) · [NestJS Latam](https://nestjslatam.dev/)

</div>
