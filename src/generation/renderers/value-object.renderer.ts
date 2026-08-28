import { Artifact, artifact } from '../artifact.model';
import { ValueObjectSpec } from '../aggregate-spec.schema';
import { fileStem, singleQuoted } from '../naming';

const BASE_CLASS = {
  string: 'StringValueObject',
  number: 'NumberValueObject',
} as const;

const BUILT_IN_VALIDATORS = {
  string: ['StringNotNullOrEmptyValidator'],
  number: ['NumberNotNullValidator'],
} as const;

/**
 * Emits a value object and, when the spec carries invariants, the rule
 * validator that enforces them.
 */
export function renderValueObject(spec: ValueObjectSpec): Artifact[] {
  const stem = fileStem(spec.name);
  const base = BASE_CLASS[spec.kind];
  const primitive = spec.kind === 'string' ? 'string' : 'number';
  const hasRules = spec.rules.length > 0;
  const validatorName = `${spec.name}RulesValidator`;

  const imports = [base, ...BUILT_IN_VALIDATORS[spec.kind]].sort();

  const valueObject = `import {
${imports.map((name) => `  ${name},`).join('\n')}
} from '@nestjslatam/ddd-lib';
${hasRules ? `import { ${validatorName} } from './validators';\n` : ''}
/**
 * ${spec.description}
 */
export class ${spec.name} extends ${base} {
  constructor(value: ${primitive}) {
    super(value);
  }

  static create(value: ${primitive}): ${spec.name} {
    const instance = new ${spec.name}(value);

    if (!instance.isValid) {
      const errors = instance.brokenRules.getBrokenRules();
      throw new Error(
        \`Invalid ${spec.name}: \${errors.map((error) => error.message).join(', ')}\`,
      );
    }

    return instance;
  }

  /** Rehydrates without validating: the value is already known to be sound. */
  static load(value: ${primitive}): ${spec.name} {
    return new ${spec.name}(value);
  }

  override addValidators(): void {
    super.addValidators();
${BUILT_IN_VALIDATORS[spec.kind]
  .map((name) => `    this.validatorRules.add(new ${name}(this));`)
  .join('\n')}${
    hasRules ? `\n    this.validatorRules.add(new ${validatorName}(this));` : ''
  }
  }
}`;

  const artifacts = [
    artifact('value-object', `shared/valueobjects/${stem}.ts`, valueObject),
  ];

  if (hasRules) {
    artifacts.push(
      artifact(
        'validator',
        `shared/valueobjects/validators/${stem}-rules.validator.ts`,
        renderValueObjectValidator(spec, validatorName, stem),
      ),
    );
  }

  return artifacts;
}

function renderValueObjectValidator(
  spec: ValueObjectSpec,
  validatorName: string,
  stem: string,
): string {
  const rules = spec.rules
    .map(
      (rule) => `    if (${rule.condition}) {
      this.addBrokenRule('${rule.property}', ${singleQuoted(rule.message)});
    }`,
    )
    .join('\n\n');

  return `import { AbstractRuleValidator } from '@nestjslatam/ddd-lib';
import { ${spec.name} } from '../${stem}';

/**
 * Invariants for ${spec.name}. Each condition is true when the rule is broken.
 */
export class ${validatorName} extends AbstractRuleValidator<${spec.name}> {
  constructor(subject: ${spec.name}) {
    super(subject);
  }

  public addRules(): void {
    const value = this.subject.getValue();

${rules}
  }
}`;
}
