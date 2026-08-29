import { Artifact, artifact } from '../generation/artifact.model';
import { fileStem } from '../generation/naming';

/** The stereotypes `ddd new` knows how to build without a model. */
export const STEREOTYPES = [
  'value-object',
  'validator',
  'event',
  'exception',
  'aggregate',
  'enum',
] as const;

export type StereotypeKind = (typeof STEREOTYPES)[number];

export interface NewRequest {
  kind: StereotypeKind;
  name: string;
  /** For value objects: which primitive it wraps. */
  primitive?: 'string' | 'number';
  /** For validators: the type being audited. */
  subject?: string;
}

/**
 * Templates for the stereotypes a developer reaches for most.
 *
 * Deliberately model-free. These have one correct shape, taken from how the
 * library's own code is written, and a model would only introduce variance
 * where none is wanted. `generate:aggregate` is where the model earns its
 * place -- deciding what to build, not how to spell it.
 */
export function renderStereotype(request: NewRequest): Artifact[] {
  switch (request.kind) {
    case 'value-object':
      return [renderValueObject(request)];
    case 'validator':
      return [renderValidator(request)];
    case 'event':
      return [renderEvent(request)];
    case 'exception':
      return [renderException(request)];
    case 'aggregate':
      return [renderAggregate(request)];
    case 'enum':
      return [renderEnum(request)];
  }
}

function renderValueObject(request: NewRequest): Artifact {
  const primitive = request.primitive ?? 'string';
  const base =
    primitive === 'number' ? 'NumberValueObject' : 'StringValueObject';
  const guard =
    primitive === 'number'
      ? 'NumberNotNullValidator'
      : 'StringNotNullOrEmptyValidator';

  return artifact(
    'value-object',
    `shared/valueobjects/${fileStem(request.name)}.ts`,
    `import { ${base}, ${guard} } from '@nestjslatam/ddd-lib';

/**
 * TODO: describe what ${request.name} means in your domain.
 */
export class ${request.name} extends ${base} {
  constructor(value: ${primitive}) {
    super(value);
  }

  /**
   * The library collects broken rules rather than throwing, so a factory has
   * to check isValid itself. Skipping that check is how invalid values reach
   * an aggregate.
   */
  static create(value: ${primitive}): ${request.name} {
    const instance = new ${request.name}(value);

    if (!instance.isValid) {
      const errors = instance.brokenRules.getBrokenRules();
      throw new Error(
        \`Invalid ${request.name}: \${errors.map((error) => error.message).join(', ')}\`,
      );
    }

    return instance;
  }

  /** Rehydrates without validating: the value is already known to be sound. */
  static load(value: ${primitive}): ${request.name} {
    return new ${request.name}(value);
  }

  override addValidators(): void {
    // Dropping this super call silently discards the base's own rules.
    super.addValidators();
    this.validatorRules.add(new ${guard}(this));
    // TODO: add a rule validator for this value object's own invariants.
  }
}`,
  );
}

function renderValidator(request: NewRequest): Artifact {
  const subject = request.subject ?? 'unknown';
  const subjectImport =
    subject === 'unknown'
      ? ''
      : `import { ${subject} } from '../${fileStem(subject)}';\n`;

  return artifact(
    'validator',
    `shared/valueobjects/validators/${fileStem(request.name)}.ts`,
    `import { AbstractRuleValidator } from '@nestjslatam/ddd-lib';
${subjectImport}
/**
 * Invariants for ${subject}.
 *
 * Each condition is written to be TRUE when the rule is BROKEN -- the opposite
 * of how an assertion reads.
 */
export class ${request.name} extends AbstractRuleValidator<${subject}> {
  constructor(subject: ${subject}) {
    super(subject);
  }

  public addRules(): void {
    // TODO: state the invariants.
    // if (condition) {
    //   this.addBrokenRule('property', 'Message for the caller');
    // }
  }
}`,
  );
}

function renderEvent(request: NewRequest): Artifact {
  const name = request.name.endsWith('Event')
    ? request.name
    : `${request.name}Event`;

  return artifact(
    'domain-event',
    `domain/events/${fileStem(name)}.ts`,
    `import { AbstractDomainEvent, EventMetadata } from '@nestjslatam/ddd-lib';

/**
 * TODO: describe what happened in the business for this to be raised.
 */
export class ${name} extends AbstractDomainEvent {
  constructor(
    // Carry the domain payload only, and only primitives: events are
    // serialised, and a value object would not survive the round trip.
    // Do NOT declare aggregateId here -- the base already exposes it as an
    // accessor derived from the metadata, and redeclaring it is a type error.
    readonly occurredFor: string,
    metadata: EventMetadata,
  ) {
    super(metadata);
  }

  /** Rebuilds the event from its serialised form, for event sourcing. */
  static fromJSON(json: Record<string, unknown>): ${name} {
    const metadata = AbstractDomainEvent.extractMetadata(json);
    const eventData = AbstractDomainEvent.extractEventData(json);

    return new ${name}(eventData.occurredFor as string, metadata);
  }
}`,
  );
}

function renderException(request: NewRequest): Artifact {
  const name = request.name.endsWith('Exception')
    ? request.name
    : `${request.name}Exception`;

  return artifact(
    'validator',
    `shared/exceptions/${fileStem(name)}.ts`,
    `import { DomainException } from '@nestjslatam/ddd-lib';

/**
 * TODO: describe the rule whose violation this reports.
 */
export class ${name} extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = '${name}';
  }
}`,
  );
}

function renderAggregate(request: NewRequest): Artifact {
  const stem = fileStem(request.name);

  return artifact(
    'aggregate',
    `${stem}/domain/${stem}-aggregate/${stem}.ts`,
    `import { DddAggregateRoot, IdValueObject } from '@nestjslatam/ddd-lib';

export interface I${request.name}Props {
  // TODO: the state inside this aggregate's consistency boundary.
  // Anything referenced but independently changeable belongs to another
  // aggregate -- hold its id, not its state.
}

/**
 * TODO: describe what ${request.name} is responsible for.
 */
export class ${request.name} extends DddAggregateRoot<
  ${request.name},
  I${request.name}Props
> {
  private constructor(props: I${request.name}Props, id?: IdValueObject) {
    super(props, { id });
    this.trackingState.markAsNew();
  }

  static create(props: I${request.name}Props): ${request.name} {
    const instance = new ${request.name}(props);

    if (!instance.isValid) {
      const errors = instance.brokenRules.getBrokenRules();
      throw new Error(
        \`Cannot create ${request.name}: \${errors
          .map((error) => \`\${error.property}: \${error.message}\`)
          .join(', ')}\`,
      );
    }

    return instance;
  }

  /** Rehydrates a persisted aggregate without re-running creation rules. */
  static load(id: IdValueObject, props: I${request.name}Props): ${request.name} {
    const instance = new ${request.name}(props, id);
    instance.trackingState.markAsClean();
    return instance;
  }

  addValidators(): void {
    // TODO: this.validators.add(new SomeValidator(this));
  }
}`,
  );
}

function renderEnum(request: NewRequest): Artifact {
  return artifact(
    'value-object',
    `shared/enums/${fileStem(request.name)}.ts`,
    `import { DddEnum } from '@nestjslatam/ddd-lib';

/**
 * TODO: describe the closed set of values this represents.
 */
export class ${request.name} extends DddEnum {
  // TODO: declare the members, e.g.
  // static readonly ACTIVE = new ${request.name}('ACTIVE');
}`,
  );
}
