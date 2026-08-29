<div align="center">

# `@nestjslatam/ddd-cli`

**Entiende, andamia y audita [`@nestjslatam/ddd-lib`](https://github.com/nestjslatam/ddd) — desde tu terminal, o desde el agente de IA que ya usas.**

[![npm](https://img.shields.io/npm/v/%40nestjslatam%2Fddd-cli?color=1e73be&label=ddd-cli)](https://www.npmjs.com/package/@nestjslatam/ddd-cli)
[![CI](https://github.com/nestjslatam/ddd-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/nestjslatam/ddd-cli/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/pruebas-80%20unitarias%20%2B%2053%20aceptación-00d084)](#las-pruebas-y-el-robot)
[![sin clave](https://img.shields.io/badge/clave%20de%20API-no%20hace%20falta-00d084)](#usarlo-desde-un-agente-de-ia)
[![license](https://img.shields.io/badge/licencia-MIT-575760)](LICENSE)

[**Guía completa**](docs/GUIDE.md) · [Por qué](#por-qué) · [Comandos](#comandos) · [MCP](#usarlo-desde-un-agente-de-ia) · [Preguntas frecuentes](#preguntas-frecuentes) · [Colaborar](#colaborar)

**[📖 Documentación en docs.nestjslatam.dev](https://docs.nestjslatam.dev/cli/)**

</div>

---

```bash
npm install -D @nestjslatam/ddd-cli
```

> [!TIP]
> **[Lee la guía completa →](docs/GUIDE.md)** — cada comando y cada opción, recorridos construyendo el dominio de transporte marítimo desde cero hasta diez ficheros que compilan. Cada línea de salida de esa página se produjo ejecutando el CLI, no se escribió de memoria.

## Por qué

La mayoría de los CLI de andamiaje llevan una plantilla fija y confían en que siga cuadrando con la librería. Éste **lee los ficheros `.d.ts` del `ddd-lib` instalado en tu proyecto** con la API del compilador de TypeScript. Pregúntale por `DddAggregateRoot` y te describe **tu** versión — incluida una versión que nunca ha visto, y una base que hayas añadido tú en tu propio fork.

```bash
npx ddd list
```

```
  extend     hereda de ella
  implement  cumple la interfaz
  compose    el agregado delega en ella
  use        se llama directamente

  Aggregates
  compose    AggregateValidationOrchestrator
  extend     DddAggregateRoot                 extends AggregateRoot

  Value Objects
  extend     DddValueObject            extends AbstractNotifyPropertyChanged · implement getEqualityComponents
  extend     IdValueObject             extends DddValueObject
  extend     NumberValueObject         extends DddValueObject
  …
  66 símbolos · ddd explain <nombre> para cualquiera de ellos
```

Esa división en cuatro es casi todo lo que hay que entender del diseño. `compose` es la que más se confunde: `BrokenRulesManager`, `ValidatorRuleManager` y `TrackingStateManager` son colaboradores que un agregado **tiene**, no bases de las que se hereda.

## Comandos

| Comando                            | Qué hace                                                                        | ¿Usa modelo? |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| `ddd list`                         | Cada estereotipo, agrupado, con su rol                                          | No           |
| `ddd explain <nombre>`             | Un símbolo: contrato, qué implementar, un ejemplo                               | Opcional     |
| `ddd new <tipo> <Nombre>`          | Andamia un value object, validador, evento, excepción, agregado o enum          | No           |
| `ddd extend <Base> <Nombre>`       | Hereda de cualquier base, con los miembros abstractos esbozados                 | No           |
| `ddd validate`                     | Audita tu código contra cuatro reglas del idioma                                | No           |
| `ddd generate:aggregate "<prosa>"` | Modela un agregado a partir de una descripción                                  | **Sí**       |
| `ddd mcp`                          | Corre como servidor MCP para un agente de IA                                    | No           |

Cinco de los siete no tocan un modelo jamás.

### Andamiaje

```bash
npx ddd new value-object OrderTotal --kind number
npx ddd new validator OrderTotalRules --for OrderTotal
npx ddd extend AbstractRuleValidator ShippingRules
```

`extend` deriva el contrato de las declaraciones instaladas, así que funciona con bases que nunca ha visto. **No se escribe nada antes de que veas la lista de ficheros y confirmes** — la vista previa nombra la ruta y qué es cada fichero:

```
  Sku extends StringValueObject

  Ficheros bajo src
  create  shared/valueobjects/sku.ts  value-object

  1 nuevo · 0 ya existentes
  ¿Escribir este fichero? (s/N)
```

Todo lo que emite `ddd new` **pasa `ddd validate`**. Las plantillas no son sólo plausibles: cumplen la propia auditoría de la herramienta.

Apúntalo a algo que no sea una clase base y en vez de dar error te enseña:

```
  BrokenRulesManager no es una clase base.

  BrokenRulesManager es un colaborador: un agregado o un value object tiene
  uno y delega en él, en lugar de heredar de él.

  Ejecuta `ddd list --role extend` para ver de qué se puede heredar.
```

### Auditoría

```bash
npx ddd validate
```

Cuatro reglas, cada una un error que `ddd-lib` hace fácil y silencioso:

| Regla                                 | Atrapa                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `no-subclass-state-in-add-validators` | Leer un campo de la subclase dentro de `addValidators()`, que el constructor base llama **antes** de que corra el cuerpo del tuyo |
| `super-add-validators`                | Un override que no encadena, y tira los validadores reales de la base                                                          |
| `factory-checks-validity`             | Un `create()` que nunca comprueba `isValid`, así que los objetos inválidos se escapan                                          |
| `handler-commits-events`              | Un handler sin `mergeObjectContext(...).commit()`, así que no se despacha ningún evento                                        |

La primera no es hipotética: es exactamente cómo `NumberValueObject` se publicó roto durante dos versiones de la librería.

`validate` también señala **las llamadas a `isValid` que no cuadran con tu versión instalada** — es un getter desde `ddd-lib` 3.0.0. Ésa es la parte mecánica de la migración 2.x → 3.0.0:

```
error  3  Order.create() llama a isValid(), pero la librería instalada lo declara como getter
```

## Usarlo desde un agente de IA

Si ya trabajas en Claude Code, Codex o Cursor, ese agente tiene modelo y credenciales. El CLI no necesita los suyos.

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

Siete herramientas, **sin clave de API**: `ddd_list`, `ddd_describe`, `ddd_new`, `ddd_extend`, `ddd_validate`, `ddd_aggregate_schema`, `ddd_render_aggregate`.

El reparto de trabajo es lo importante. **El agente decide** la frontera del agregado, las invariantes, los nombres — criterio. **El CLI hace** lo que un modelo hace mal: leer las declaraciones instaladas con exactitud, renderizar de forma determinista y auditar contra el idioma. `ddd_describe` devuelve hechos y no prosa a propósito; la explicación la escribe el agente, que para eso está.

`ddd_aggregate_schema` y `ddd_render_aggregate` hacen el reparto explícito: el agente produce una especificación, el CLI la renderiza, y una especificación que no cumple el esquema vuelve con los problemas campo por campo, así que el agente se corrige solo sin que haya nadie mirando.

Nada llega al disco salvo que una llamada pase `write: true`, y aun así jamás se sobrescribe un fichero existente — un agente actuando sin supervisión no debe pisar código de dominio escrito a mano.

## Las pruebas y el robot

```bash
npm test        # 80 pruebas unitarias, 8 suites
npm run robot   # 53 escenarios de aceptación
```

El **robot de aceptación** es lo que hace comprobables las afirmaciones de arriba. Construye un proyecto NestJS desechable, le instala un `@nestjslatam/ddd-lib` real y conduce el **binario compilado como subproceso** por cada comando, opción y camino de error — y después **comprueba los tipos del código generado** con `tsc`. Doce de sus escenarios hablan MCP sobre stdio como lo haría un cliente real, incluida una comprobación de que nada fuera del protocolo llega a stdout: MCP es JSON-RPC sobre ese flujo, y una sola línea de log perdida hace que un cliente corte la conexión.

Las pruebas unitarias nunca cazaron los dos peores bugs que ha tenido este proyecto. El robot sí:

- los handlers de mutación generados referenciaban un `id` sin enlazar, así que todo handler que no fuera de creación fallaba en `tsc`
- la plantilla de eventos redeclaraba `aggregateId`, un `TS2610` que ninguna prueba unitaria estaba buscando

CI además empaqueta el tarball real y lo instala en un proyecto limpio para demostrar que el artefacto publicado funciona — incluida la comprobación de que el binario `ddd` se instaló de verdad.

## Preguntas frecuentes

<details>
<summary><b>¿Necesito una clave de API de Anthropic o de OpenAI?</b></summary>

**No**, para todo salvo `ddd generate:aggregate` y `ddd explain --with-model`. `list`, `new`, `extend`, `validate` y `mcp` no contactan con ningún modelo. Y por MCP incluso el modelado lo hace el modelo de **tu agente**, así que ahí tampoco hace falta clave nunca.
</details>

<details>
<summary><b>Cuatro paquetes <code>@nestjslatam</code>, ¿cuál instalo?</b></summary>

[`ddd-lib`](https://github.com/nestjslatam/ddd) es la librería y la única dependencia de ejecución que necesitas. Este CLI es dependencia **de desarrollo**. [`ddd-valueobjects`](https://github.com/nestjslatam/ddd-valueobjects) y [`ddd-es-lib`](https://github.com/nestjslatam/ddd-event-sourcing) son complementos opcionales.
</details>

<details>
<summary><b>Si corre como servidor MCP, ¿para qué sigue habiendo un CLI suelto?</b></summary>

Porque en CI no hay agente. `ddd validate` en un pipeline es la razón de que exista el binario suelto, y es el modo sin ningún modelo de por medio — determinista y guiado por código de salida.
</details>

<details>
<summary><b>¿<code>ddd list</code> informa de mi versión de <code>ddd-lib</code>, o de una tabla incrustada en el CLI?</b></summary>

De la tuya. Resuelve `@nestjslatam/ddd-lib` desde tu proyecto y parsea sus `.d.ts` con la API del compilador de TypeScript. Fuera de un proyecto recurre a su propia copia incluida — la `4.0.0` a fecha de la `0.4.0`.
</details>

<details>
<summary><b>¿Qué me aporta frente a escribir yo la clase?</b></summary>

Para un value object, sinceramente poco — son veinte líneas. El valor está en las partes que es fácil equivocar **en silencio**: `extend` esboza exactamente los miembros abstractos que declara tu versión instalada, y `validate` atrapa cuatro errores que no producen ningún fallo visible, sólo objetos que se saltan calladamente sus propias invariantes.
</details>

<details>
<summary><b>¿La <code>0.4.0</code> está lista para producción? ¿Qué me va a morder?</b></summary>

El CLI es anterior a la 1.0 y su superficie puede moverse en cualquier versión menor, así que clava una versión exacta.

La librería que lee es otra cuestión: `@nestjslatam/ddd-lib@4.0.0` es la primera versión con pruebas sobre las clases que extiendes — 1017 de ellas, 98,6 % de cobertura — y llegar ahí destapó 34 defectos. Su riesgo restante es cambio de API, no corrección. `ddd validate` es la herramienta para exactamente eso: lee cómo declara las cosas **tu** versión instalada y señala las llamadas que ya no cuadran.

Asperezas conocidas del propio CLI: `ddd generate:aggregate` es el único comando cuya salida no es determinista, y el andamiaje escribe en una estructura inferida de `nest-cli.json` — revisa la vista previa antes de confirmar si tu proyecto está organizado de forma poco habitual.
</details>

<details>
<summary><b>¿Funcionará con mi versión de Node y de NestJS?</b></summary>

Node `>=20.11`; CI ejecuta 20.x y 22.x. Es una herramienta de desarrollo, así que no restringe la versión de NestJS de tu aplicación — pero `list`, `explain` y `extend` leen el `ddd-lib` que tengas instalado, y `ddd-lib` declara NestJS `^10 || ^11`.
</details>

## Colaborar

Trabajo concreto, verificable en minutos:

1. **Más reglas de `validate`.** Las cuatro están en [`src/validate/idiom-rules.ts`](src/validate/idiom-rules.ts); cada una es un pequeño predicado sobre el AST con su prueba al lado. La librería tiene más trampas silenciosas que cuatro.
2. **Más estereotipos de `new`.** [`src/scaffold/stereotype.renderer.ts`](src/scaffold/stereotype.renderer.ts) — repositorios, sagas y command handlers no están cubiertos.
3. **Escenarios del robot para los huecos.** Dos de los 53 se saltan porque necesitan un modelo en vivo; cualquier otra cosa que falte es un hueco que merece la pena llenar.

Antes de abrir un PR:

```bash
npm run lint && npm run type-check && npm test && npm run robot
```

CI lo ejecuta todo en Node 20 y 22, más una comprobación de instalación del tarball. Los commits siguen [Conventional Commits](https://www.conventionalcommits.org/).

## Requisitos

Node `>=20.11`. Construido con NestJS y [nest-commander](https://nest-commander.jaymcdoniel.dev/); el CLI es una aplicación Nest de verdad, así que los comandos son proveedores inyectables y se prueban como tales.

## Quiénes están detrás

Construido y mantenido por **[BeyondNet Tech](https://beyondnet.info/)** junto a la comunidad [NestJS Latam](https://nestjslatam.dev/).

- **[Evolith](https://github.com/beyondnetcode/evolith_arch32)** — gobierno de arquitectura ejecutable: un CLI, un servidor MCP y una API REST que comprueban un repositorio contra reglas Rego/OPA, y que informan de una regla que no pudieron evaluar como un fallo en lugar de dejarla pasar en silencio. La misma idea que `ddd validate`, un nivel por encima.
- **[Shell.ddd](https://github.com/beyondnetcode/Shell.ddd)** — la contraparte .NET de `ddd-lib`.

## Más

- [**La guía**](docs/GUIDE.md) — cada comando, cada opción, un dominio completo de principio a fin
- [`nestjslatam/ddd`](https://github.com/nestjslatam/ddd) — la librería que esta herramienta lee
- [CHANGELOG](CHANGELOG.md) — cada versión y su porqué

## Licencia

MIT — ver [LICENSE](LICENSE). Ojo: la `0.2.0` y anteriores incluían por error un fichero GPL-3.0; un tarball publicado no se puede enmendar en su sitio, así que actualiza en lugar de fiarte del texto de licencia de una versión antigua.

---

<div align="center">

**Impulsado por [BeyondNetCode](https://beyondnet.info/)**

[Web](https://beyondnet.info/) · [GitHub](https://github.com/beyondnetcode) · [NestJS Latam](https://nestjslatam.dev/)

</div>
