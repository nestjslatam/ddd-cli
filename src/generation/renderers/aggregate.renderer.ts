import { Artifact, artifact } from '../artifact.model';
import { AggregateSpec } from '../aggregate-spec.schema';
import { fileStem, singleQuoted, toCamelCase } from '../naming';

/**
 * Emits the aggregate root and the validator holding its cross-property
 * invariants.
 */
export function renderAggregate(spec: AggregateSpec): Artifact[] {
  const slug = spec.slug!;
  const stem = fileStem(spec.name);
  const instance = toCamelCase(spec.name);
  const hasInvariants = spec.invariants.length > 0;
  const invariantsValidator = `${spec.name}InvariantsValidator`;

  const valueObjectNames = new Set(spec.valueObjects.map((vo) => vo.name));
  const usedValueObjects = [
    ...new Set(
      spec.properties
        .map((property) => property.type)
        .filter((type) => valueObjectNames.has(type)),
    ),
  ].sort();

  const propsFields = spec.properties
    .map((property) => {
      const doc = property.description
        ? `  /** ${property.description} */\n`
        : '';
      return `${doc}  ${property.name}: ${property.type};`;
    })
    .join('\n');

  const createParams = spec.properties
    .map((property) => `    ${property.name}: ${property.type},`)
    .join('\n');

  const createAssignments = spec.properties
    .map((property) => `      ${property.name},`)
    .join('\n');

  const valueObjectImport = usedValueObjects.length
    ? `import {\n${usedValueObjects
        .map((name) => `  ${name},`)
        .join('\n')}\n} from '../../../shared/valueobjects';\n`
    : '';

  const validatorImport = hasInvariants
    ? `import { ${invariantsValidator} } from './validators';\n`
    : '';

  const contents = `import { DddAggregateRoot, IdValueObject } from '@nestjslatam/ddd-lib';

${valueObjectImport}${validatorImport}
export interface I${spec.name}Props {
${propsFields}
}

/**
 * ${spec.description}
 */
export class ${spec.name} extends DddAggregateRoot<${spec.name}, I${spec.name}Props> {
  private constructor(props: I${spec.name}Props, id?: IdValueObject) {
    super(props, { id });
    this.trackingState.markAsNew();
  }

  static create(
${createParams}
  ): ${spec.name} {
    const ${instance} = new ${spec.name}({
${createAssignments}
    });

    if (!${instance}.isValid()) {
      const errors = ${instance}.brokenRules.getBrokenRules();
      throw new Error(
        \`Cannot create ${spec.name}: \${errors
          .map((error) => \`\${error.property}: \${error.message}\`)
          .join(', ')}\`,
      );
    }

    return ${instance};
  }

  /** Rehydrates a persisted aggregate without re-running creation rules. */
  static load(id: IdValueObject, props: I${spec.name}Props): ${spec.name} {
    const ${instance} = new ${spec.name}(props, id);
    ${instance}.trackingState.markAsClean();
    return ${instance};
  }

  addValidators(): void {${
    hasInvariants
      ? `\n    this.validators.add(new ${invariantsValidator}(this));`
      : `\n    // No cross-property invariants were modelled for this aggregate.`
  }
  }
${spec.properties
  .map(
    (property) => `
  get ${property.name}(): ${property.type} {
    return this.props.${property.name};
  }`,
  )
  .join('\n')}
}`;

  const artifacts = [
    artifact(
      'aggregate',
      `${slug}/domain/${slug}-aggregate/${stem}.ts`,
      contents,
    ),
  ];

  if (hasInvariants) {
    artifacts.push(
      artifact(
        'validator',
        `${slug}/domain/${slug}-aggregate/validators/${stem}-invariants.validator.ts`,
        renderInvariantsValidator(spec, invariantsValidator, stem),
      ),
    );
  }

  return artifacts;
}

function renderInvariantsValidator(
  spec: AggregateSpec,
  validatorName: string,
  stem: string,
): string {
  const rules = spec.invariants
    .map(
      (rule) => `    if (${rule.condition}) {
      this.addBrokenRule('${rule.property}', ${singleQuoted(rule.message)});
    }`,
    )
    .join('\n\n');

  return `import { AbstractRuleValidator } from '@nestjslatam/ddd-lib';
import { ${spec.name} } from '../${stem}';

/**
 * Invariants spanning more than one property of ${spec.name}.
 * Each condition is true when the rule is broken.
 */
export class ${validatorName} extends AbstractRuleValidator<${spec.name}> {
  constructor(subject: ${spec.name}) {
    super(subject);
  }

  public addRules(): void {
    const props = this.subject.props;

${rules}
  }
}`;
}
