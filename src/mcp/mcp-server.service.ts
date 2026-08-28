import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  aggregateJsonSchema,
  aggregateSpec,
} from '../generation/aggregate-spec.schema';
import { ArtifactGeneratorService } from '../generation/artifact-generator.service';
import { Artifact } from '../generation/artifact.model';
import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { ArtifactWriterService } from '../project/artifact-writer.service';
import { ProjectLocatorService } from '../project/project-locator.service';
import { ScaffoldService } from '../scaffold/scaffold.service';
import {
  STEREOTYPES,
  StereotypeKind,
  renderStereotype,
} from '../scaffold/stereotype.renderer';
import { ValidateService } from '../validate/validate.service';

const NAME = '@nestjslatam/ddd-cli';
const VERSION = '0.1.0';

/**
 * Exposes the CLI's deterministic capabilities as MCP tools.
 *
 * The point is the division of labour. An agent that is already running --
 * Claude Code, Codex, Cursor -- has a model and credentials; asking it to also
 * provision an API key so the CLI can open a second connection is redundant.
 * So the agent supplies the judgement (what to model, how to explain it) and
 * this supplies what a model is bad at: reading the installed declarations
 * exactly, rendering code deterministically, and auditing against the idiom.
 *
 * `ddd_describe` deliberately returns facts rather than prose. The agent
 * writes the explanation; that is what it is for.
 */
@Injectable()
export class McpServerService {
  constructor(
    private readonly library: LibraryIntrospectorService,
    private readonly scaffold: ScaffoldService,
    private readonly generator: ArtifactGeneratorService,
    private readonly locator: ProjectLocatorService,
    private readonly writer: ArtifactWriterService,
    private readonly validator: ValidateService,
  ) {}

  async serve(): Promise<void> {
    const server = new McpServer({ name: NAME, version: VERSION });

    this.registerList(server);
    this.registerDescribe(server);
    this.registerNew(server);
    this.registerExtend(server);
    this.registerValidate(server);
    this.registerAggregateSchema(server);
    this.registerRenderAggregate(server);

    await server.connect(new StdioServerTransport());
  }

  // --- tools --------------------------------------------------------------

  private registerList(server: McpServer): void {
    server.registerTool(
      'ddd_list',
      {
        title: 'List DDD stereotypes',
        description:
          'Inventory every stereotype exported by the @nestjslatam/ddd-lib installed in this project, with the role of each: extend (a base you subclass), implement (an interface), compose (a collaborator the aggregate delegates to) or use. Read from the real .d.ts files, so it reflects the installed version.',
        inputSchema: {
          family: z
            .string()
            .optional()
            .describe(
              'Filter by family, e.g. "validation", "value", "aggregate", "event", "exception"',
            ),
          role: z
            .enum(['extend', 'implement', 'compose', 'use'])
            .optional()
            .describe('Filter by how the stereotype is meant to be used'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ family, role }) => {
        let symbols = this.library.read();

        if (family) {
          const wanted = family.toLowerCase();
          symbols = symbols.filter((s) =>
            s.family.toLowerCase().includes(wanted),
          );
        }
        if (role) {
          symbols = symbols.filter((s) => s.role === role);
        }

        return this.json(
          symbols.map((symbol) => ({
            name: symbol.name,
            family: symbol.family,
            role: symbol.role,
            kind: symbol.kind,
            extends: symbol.extends,
            aliasOf: symbol.aliasOf,
            mustImplement: symbol.abstractMembers.map((m) => m.name),
          })),
        );
      },
    );
  }

  private registerDescribe(server: McpServer): void {
    server.registerTool(
      'ddd_describe',
      {
        title: 'Describe one DDD stereotype',
        description:
          'Return the real type declaration of one stereotype: signature, base class, abstract members you must implement, public members, static factories and published documentation. Returns facts, not prose -- write the explanation yourself from this. Everything comes from the installed .d.ts, so it cannot describe an API that does not exist.',
        inputSchema: {
          symbol: z.string().describe('The stereotype name, case-insensitive'),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ symbol }) => {
        const found = this.library.find(symbol);

        if (!found) {
          return this.json({
            error: `No symbol named "${symbol}" in @nestjslatam/ddd-lib.`,
            didYouMean: this.library.suggest(symbol),
          });
        }

        return this.json({
          name: found.name,
          kind: found.kind,
          isAbstract: found.isAbstract,
          family: found.family,
          role: found.role,
          extends: found.extends,
          implements: found.implements,
          aliasOf: found.aliasOf,
          typeParameters: found.typeParameters,
          documentation: found.doc,
          mustImplement: found.abstractMembers.map((m) => ({
            name: m.name,
            signature: m.signature,
            documentation: m.doc,
          })),
          staticFactories: found.members
            .filter((m) => m.isStatic)
            .map((m) => m.signature),
          members: found.members
            .filter((m) => !m.isStatic)
            .map((m) => m.signature),
          declaredIn: found.file,
        });
      },
    );
  }

  private registerNew(server: McpServer): void {
    server.registerTool(
      'ddd_new',
      {
        title: 'Scaffold a DDD stereotype',
        description:
          'Generate a single stereotype from a deterministic template that already follows the library idiom. Returns the files without writing unless write is true.',
        inputSchema: {
          stereotype: z.enum(STEREOTYPES).describe('What to scaffold'),
          name: z.string().describe('PascalCase class name'),
          primitive: z
            .enum(['string', 'number'])
            .optional()
            .describe('For value objects: which primitive it wraps'),
          subject: z
            .string()
            .optional()
            .describe('For validators: the type being audited'),
          write: z
            .boolean()
            .optional()
            .describe('Write to disk. Defaults to false, returning contents.'),
        },
      },
      async ({ stereotype, name, primitive, subject, write }) => {
        if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
          return this.json({
            error: `"${name}" is not a valid class name. Use PascalCase.`,
          });
        }

        const artifacts = renderStereotype({
          kind: stereotype as StereotypeKind,
          name,
          primitive,
          subject,
        });

        return this.deliver(artifacts, write);
      },
    );
  }

  private registerExtend(server: McpServer): void {
    server.registerTool(
      'ddd_extend',
      {
        title: 'Subclass a library base',
        description:
          'Scaffold a subclass of any @nestjslatam/ddd-lib base, stubbing every abstract member the installed declaration reports. Returns the file without writing unless write is true.',
        inputSchema: {
          base: z.string().describe('The base class to extend'),
          name: z.string().describe('PascalCase name for the new class'),
          directory: z
            .string()
            .optional()
            .describe('Destination folder relative to the source root'),
          write: z
            .boolean()
            .optional()
            .describe('Write to disk. Defaults to false, returning contents.'),
        },
      },
      async ({ base, name, directory, write }) => {
        try {
          const resolved = this.library.find(base);
          const artifacts = this.scaffold.extend({
            base,
            name,
            directory:
              directory ??
              (resolved
                ? this.scaffold.defaultDirectory(resolved, name)
                : 'domain'),
          });

          const delivered = await this.deliver(artifacts, write);
          return delivered;
        } catch (error) {
          return this.json({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  }

  private registerValidate(server: McpServer): void {
    server.registerTool(
      'ddd_validate',
      {
        title: 'Audit code against the library idiom',
        description:
          "Check TypeScript for mistakes @nestjslatam/ddd-lib makes easy and silent: reading subclass state in addValidators() before the constructor assigns it, an override that drops the base's validators, a factory that never checks isValid, and a command handler that never dispatches its domain events.",
        inputSchema: {
          path: z
            .string()
            .optional()
            .describe(
              "File or directory to scan. Defaults to the project's source root.",
            ),
        },
        annotations: { readOnlyHint: true },
      },
      async ({ path }) => {
        try {
          const project = this.locator.locate();
          const target = path ? resolve(path) : project.sourceRoot;
          const findings = this.validator.run(target, project.root);

          return this.json({
            findings,
            errors: findings.filter((f) => f.severity === 'error').length,
            warnings: findings.filter((f) => f.severity === 'warning').length,
          });
        } catch (error) {
          return this.json({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  }

  private registerAggregateSchema(server: McpServer): void {
    server.registerTool(
      'ddd_aggregate_schema',
      {
        title: 'Get the aggregate specification contract',
        description:
          'Return the JSON Schema an aggregate model must satisfy, plus the modelling rules to follow. Produce a specification matching it yourself, then pass it to ddd_render_aggregate -- you do the domain modelling, this renders the code.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
      },
      async () =>
        this.json({
          schema: aggregateJsonSchema(),
          modellingRules: [
            'Model exactly one aggregate: the one the description is really about.',
            'Include only properties inside its consistency boundary. Anything referenced but independently changeable is another aggregate -- hold its id, not its state.',
            'Prefer value objects over primitives whenever the concept carries a constraint. A price, an email, a quantity are value objects; a boolean flag is not.',
            'Write each rule condition as a TypeScript boolean expression that is TRUE when the rule is BROKEN. In a value object rule "value" is the primitive; in an aggregate invariant "props" holds the properties.',
            'Every rule must come from the description or an unambiguous domain reality. Do not invent business limits the description does not imply.',
            'Name events in the past tense, after what happened in the business.',
            'Events carry primitives only, never value objects: they are serialised.',
          ],
        }),
    );
  }

  private registerRenderAggregate(server: McpServer): void {
    server.registerTool(
      'ddd_render_aggregate',
      {
        title: 'Render an aggregate from a specification',
        description:
          'Turn an aggregate specification into a full set of files: the aggregate root, its value objects and validators, domain events, CQRS commands with handlers, a repository and a wired NestJS module. Get the contract from ddd_aggregate_schema first. Returns the files without writing unless write is true.',
        inputSchema: {
          spec: z
            .unknown()
            .describe('An aggregate specification matching the schema'),
          write: z
            .boolean()
            .optional()
            .describe('Write to disk. Defaults to false, returning contents.'),
        },
      },
      async ({ spec, write }) => {
        const parsed = aggregateSpec.safeParse(spec);

        if (!parsed.success) {
          // The agent produced this; telling it exactly what failed lets it
          // correct itself without a round trip through a human.
          return this.json({
            error: 'The specification does not satisfy the schema.',
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join('.') || '(root)',
              message: issue.message,
            })),
          });
        }

        const withSlug = {
          ...parsed.data,
          slug:
            parsed.data.slug ??
            parsed.data.name
              .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
              .toLowerCase(),
        };

        return this.deliver(this.generator.generate(withSlug), write);
      },
    );
  }

  // --- helpers ------------------------------------------------------------

  /** Returns artifacts, writing them only when explicitly asked. */
  private async deliver(artifacts: Artifact[], write?: boolean) {
    if (!write) {
      return this.json({
        written: false,
        files: artifacts.map((a) => ({
          path: a.path,
          kind: a.kind,
          contents: a.contents,
        })),
      });
    }

    const project = this.locator.locate();
    const plan = this.writer.plan(artifacts, project.sourceRoot);
    const result = this.writer.write(plan, project.sourceRoot, false);

    return this.json({
      written: true,
      sourceRoot: project.sourceRoot,
      created: plan.create.map((a) => a.path),
      // Existing files are never overwritten here: an agent acting
      // unattended must not clobber hand-edited domain code.
      skippedBecauseTheyExist: plan.overwrite.map((a) => a.path),
      count: result.written,
    });
  }

  private json(payload: unknown) {
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
      ],
    };
  }
}
