import { Injectable } from '@nestjs/common';
import { LlmProvider } from '../llm/llm-provider.port';
import {
  AggregateSpec,
  aggregateJsonSchema,
  aggregateSpec,
} from './aggregate-spec.schema';

const SYSTEM_PROMPT = `You are a domain modelling assistant for Domain-Driven Design projects built on the @nestjslatam/ddd-lib library for NestJS.

You are given a description of a business domain in prose. You return a structured model of ONE aggregate. You never write code -- a deterministic generator turns your model into TypeScript, so your only job is the modelling judgement.

How this library expresses DDD, so your model fits it:

- An aggregate root extends DddAggregateRoot<TSelf, TProps> and owns its invariants.
- Value objects extend StringValueObject or NumberValueObject. Anything with its own validation rules, a constrained format, or a unit of measure should be a value object rather than a raw primitive.
- Invariants are expressed as rules that report a BROKEN state. Each rule has a property, a boolean condition that is TRUE when the rule is violated, and a message written for the caller.
- Domain events carry primitives only, never value objects, because they are serialised.
- Commands are the write operations the outside world can request.

Modelling rules to follow:

- Model exactly one aggregate: the one the description is really about. Pull in only the properties that belong inside its consistency boundary. Anything referenced but independently changeable is another aggregate -- represent it as an id property, not as nested state.
- Prefer value objects over primitives whenever the concept carries a constraint. A price, an email, a quantity and a postal code are value objects. A boolean flag is not.
- Write conditions as TypeScript boolean expressions. In a value object rule, "value" is the underlying primitive. In an aggregate invariant, "props" holds the aggregate properties.
- Every rule you state must come from the description or from an unambiguous domain reality. Do not invent business limits the description does not imply. If the description says a price is positive, say so; do not also invent a maximum.
- Name events in the past tense, after what happened in the business.
- Write descriptions for a developer who has not read the original prose.`;

@Injectable()
export class AggregatePlannerService {
  /**
   * Turns a prose domain description into a validated aggregate model.
   *
   * The zod parse is the real contract. Providers differ in how strictly they
   * honour a JSON Schema, so a provider that drifts fails here with a readable
   * error rather than reaching the renderers.
   */
  async plan(
    provider: LlmProvider,
    description: string,
  ): Promise<AggregateSpec> {
    const raw = await provider.generateStructured({
      system: SYSTEM_PROMPT,
      prompt: `Model the aggregate described below.\n\n${description}`,
      schema: aggregateJsonSchema(),
      schemaName: 'aggregate_spec',
    });

    const parsed = aggregateSpec.safeParse(raw);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map(
          (issue) =>
            `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
        )
        .join('\n');
      throw new Error(
        `${provider.id} returned a model that does not satisfy the aggregate schema:\n${issues}`,
      );
    }

    return withDefaults(parsed.data);
  }
}

/** Fills in what the model is allowed to omit. */
export function withDefaults(spec: AggregateSpec): AggregateSpec {
  return { ...spec, slug: spec.slug ?? toKebabCase(spec.name) };
}

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
