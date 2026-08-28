import { Artifact, artifact } from '../artifact.model';
import { AggregateSpec } from '../aggregate-spec.schema';
import { fileStem } from '../naming';

/** Emits an in-memory repository, ready to be swapped for a real one. */
export function renderRepository(spec: AggregateSpec): Artifact {
  const slug = spec.slug!;
  const stem = fileStem(spec.name);

  const contents = `import { Injectable } from '@nestjs/common';

import { ${spec.name} } from '../../domain/${slug}-aggregate/${stem}';

/**
 * In-memory repository for ${spec.name}.
 *
 * Deliberately a starting point: it satisfies the aggregate's persistence
 * contract without binding the domain to a database. Replace the internals
 * when you choose a store -- the signature is what the handlers depend on.
 */
@Injectable()
export class ${spec.name}Repository {
  private readonly items = new Map<string, ${spec.name}>();

  async save(aggregate: ${spec.name}): Promise<void> {
    this.items.set(aggregate.id.getValue(), aggregate);
  }

  async findById(id: string): Promise<${spec.name} | null> {
    return this.items.get(id) ?? null;
  }

  async findAll(): Promise<${spec.name}[]> {
    return Array.from(this.items.values());
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.items.has(id);
  }
}`;

  return artifact(
    'repository',
    `${slug}/infrastructure/repositories/${slug}.repository.ts`,
    contents,
  );
}

/**
 * Emits the NestJS module.
 *
 * This is where generated CQRS code usually goes wrong: handlers are classes
 * NestJS only discovers if they are listed as providers, and the module needs
 * CqrsModule imported. Both are wired here so the module works as emitted.
 */
export function renderModule(spec: AggregateSpec): Artifact {
  const slug = spec.slug!;
  const handlers = spec.commands.map((command) => ({
    name: `${command.name}Handler`,
    folder: fileStem(command.name).replace(/-command$/, ''),
  }));

  const handlerImports = handlers
    .map(
      (handler) =>
        `import { ${handler.name} } from './application/use-cases/${handler.folder}/${handler.folder}.command-handler';`,
    )
    .join('\n');

  const handlerList = handlers.length
    ? handlers.map((handler) => `  ${handler.name},`).join('\n')
    : '';

  const contents = `import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { ${spec.name}Repository } from './infrastructure/repositories/${slug}.repository';
${handlerImports}

${handlers.length ? `const commandHandlers = [\n${handlerList}\n];\n` : ''}
@Module({
  imports: [CqrsModule],
  providers: [${spec.name}Repository${handlers.length ? ', ...commandHandlers' : ''}],
  exports: [${spec.name}Repository],
})
export class ${spec.name}Module {}`;

  return artifact('module', `${slug}/${slug}.module.ts`, contents);
}
