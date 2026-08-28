import { Artifact, artifact } from '../artifact.model';
import { DomainEventSpec } from '../aggregate-spec.schema';
import { fileStem } from '../naming';

/**
 * Emits a domain event.
 *
 * Events carry primitives only, and ship a `fromJSON` factory so they can be
 * replayed from an event store.
 */
export function renderDomainEvent(
  spec: DomainEventSpec,
  aggregateSlug: string,
): Artifact {
  const stem = fileStem(spec.name);

  const ctorParams = spec.properties
    .map((property) => `    readonly ${property.name}: ${property.type},`)
    .join('\n');

  const rehydrated = spec.properties
    .map((property) => `      eventData.${property.name} as ${property.type},`)
    .join('\n');

  const contents = `import { AbstractDomainEvent, EventMetadata } from '@nestjslatam/ddd-lib';

/**
 * ${spec.description}
 */
export class ${spec.name} extends AbstractDomainEvent {
  constructor(
${ctorParams}
    metadata: EventMetadata,
  ) {
    super(metadata);
  }

  /** Rebuilds the event from its serialised form, for event sourcing. */
  static fromJSON(json: Record<string, unknown>): ${spec.name} {
    const metadata = AbstractDomainEvent.extractMetadata(json);
    const eventData = AbstractDomainEvent.extractEventData(json);

    return new ${spec.name}(
${rehydrated}
      metadata,
    );
  }
}`;

  return artifact(
    'domain-event',
    `${aggregateSlug}/domain/${aggregateSlug}-aggregate/events/${stem}.ts`,
    contents,
  );
}
