import { Artifact, artifact } from '../artifact.model';
import { AggregateSpec, CommandSpec } from '../aggregate-spec.schema';
import { fileStem, toCamelCase } from '../naming';

/**
 * Emits a CQRS command and its handler.
 *
 * The handler is wired the way NestJS expects: decorated with
 * `@CommandHandler`, implementing `ICommandHandler`, and taking the repository
 * and `EventPublisher` through constructor injection. It merges the aggregate
 * into the publisher context and commits, so domain events actually dispatch --
 * skipping that step is the usual reason generated CQRS code silently drops
 * events.
 */
export function renderCommand(
  command: CommandSpec,
  aggregate: AggregateSpec,
): Artifact[] {
  const slug = aggregate.slug!;
  const stem = fileStem(command.name);
  const folder = stem.replace(/-command$/, '');
  const instance = toCamelCase(aggregate.name);
  const repository = `${aggregate.name}Repository`;
  const handlerName = `${command.name}Handler`;

  const ctorParams = command.properties
    .map(
      (property) => `    public readonly ${property.name}: ${property.type},`,
    )
    .join('\n');

  const commandFile = `/**
 * ${command.description}
 */
export class ${command.name} {
  constructor(
${ctorParams || '    // This command carries no payload.'}
  ) {}
}`;

  const destructured = command.properties.length
    ? `    const { ${command.properties.map((p) => p.name).join(', ')} } = command;\n\n`
    : '';

  const returnType = command.returns === 'string' ? 'string' : 'void';
  const returnStatement =
    command.returns === 'string'
      ? `\n    return ${instance}.id.getValue();`
      : '';

  const body =
    command.returns === 'string'
      ? buildCreateBody(aggregate, instance)
      : buildMutateBody(instance);

  // A create handler constructs value objects from the command's primitives,
  // so it needs them in scope. Missing this import is invisible until the
  // generated project is compiled.
  const constructedValueObjects =
    command.returns === 'string' ? valueObjectsUsedBy(aggregate) : [];

  const valueObjectImport = constructedValueObjects.length
    ? `import {\n${constructedValueObjects
        .map((name) => `  ${name},`)
        .join('\n')}\n} from '../../../../shared/valueobjects';\n`
    : '';

  const handlerFile = `import {
  CommandHandler,
  EventPublisher,
  ICommandHandler,
} from '@nestjs/cqrs';

${valueObjectImport}import { ${aggregate.name} } from '../../../domain/${slug}-aggregate/${fileStem(aggregate.name)}';
import { ${repository} } from '../../../infrastructure/repositories/${slug}.repository';
import { ${command.name} } from './${folder}.command';

@CommandHandler(${command.name})
export class ${handlerName}
  implements ICommandHandler<${command.name}, ${returnType}>
{
  constructor(
    private readonly publisher: EventPublisher,
    private readonly repository: ${repository},
  ) {}

  async execute(command: ${command.name}): Promise<${returnType}> {
${destructured}${body}

    // Merging into the publisher context is what makes commit() dispatch the
    // aggregate's domain events. Without it they are collected and dropped.
    const merged = this.publisher.mergeObjectContext(${instance});
    merged.commit();${returnStatement}
  }
}`;

  return [
    artifact(
      'command',
      `${slug}/application/use-cases/${folder}/${folder}.command.ts`,
      commandFile,
    ),
    artifact(
      'command-handler',
      `${slug}/application/use-cases/${folder}/${folder}.command-handler.ts`,
      handlerFile,
    ),
  ];
}

/** Value object types the aggregate's create() signature requires. */
function valueObjectsUsedBy(aggregate: AggregateSpec): string[] {
  const declared = new Set(aggregate.valueObjects.map((vo) => vo.name));
  return [
    ...new Set(
      aggregate.properties
        .map((property) => property.type)
        .filter((type) => declared.has(type)),
    ),
  ].sort();
}

function buildCreateBody(aggregate: AggregateSpec, instance: string): string {
  const valueObjectNames = new Set(aggregate.valueObjects.map((vo) => vo.name));

  const args = aggregate.properties
    .map((property) =>
      valueObjectNames.has(property.type)
        ? `      ${property.type}.create(${property.name}),`
        : `      ${property.name},`,
    )
    .join('\n');

  return `    const ${instance} = ${aggregate.name}.create(
${args}
    );

    await this.repository.save(${instance});`;
}

function buildMutateBody(instance: string): string {
  return `    const ${instance} = await this.repository.findById(id);

    if (!${instance}) {
      throw new Error(\`No aggregate found for id \${id}\`);
    }

    // TODO: invoke the behaviour this command represents on the aggregate.

    await this.repository.save(${instance});`;
}
