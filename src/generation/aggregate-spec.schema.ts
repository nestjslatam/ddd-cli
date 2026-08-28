import { z } from 'zod';

/**
 * The contract between the language model and the code generator.
 *
 * The model never writes TypeScript. It performs the part it is genuinely good
 * at -- reading a domain description and proposing aggregate boundaries, value
 * objects, invariants and events -- and returns this structure. Deterministic
 * renderers turn the structure into code.
 *
 * That split is what makes several providers viable. Native structured output
 * is not uniformly available across vendors, so correctness cannot rest on the
 * provider honouring a schema. It rests here: whatever a provider returns is
 * parsed against these rules, and a provider that drifts fails loudly with a
 * validation error instead of emitting TypeScript that does not compile.
 */

const pascalCase = /^[A-Z][A-Za-z0-9]*$/;
const camelCase = /^[a-z][A-Za-z0-9]*$/;

const identifier = (what: string) =>
  z
    .string()
    .min(1)
    .regex(pascalCase, `${what} must be PascalCase (e.g. OrderLine)`);

const propertyName = z
  .string()
  .min(1)
  .regex(camelCase, 'Property names must be camelCase (e.g. unitPrice)');

/** A single invariant, rendered into an AbstractRuleValidator rule. */
export const brokenRuleSpec = z.object({
  /** The property the rule reports against, or `value` for a value object. */
  property: z.string().min(1),
  /**
   * A TypeScript boolean expression that is true when the rule is BROKEN.
   * `value` refers to the value object's primitive; `props` to aggregate props.
   */
  condition: z.string().min(1),
  /** Message surfaced to the caller when the rule breaks. */
  message: z.string().min(1),
});

export const valueObjectSpec = z.object({
  name: identifier('Value object name'),
  /** Which ddd-lib base class to extend. */
  kind: z.enum(['string', 'number']),
  description: z.string().min(1),
  rules: z.array(brokenRuleSpec).default([]),
});

export const aggregatePropertySpec = z.object({
  name: propertyName,
  /** A value object name from `valueObjects`, or a primitive/enum type. */
  type: z.string().min(1),
  description: z.string().default(''),
});

export const domainEventSpec = z.object({
  name: identifier('Event name'),
  description: z.string().min(1),
  properties: z.array(
    z.object({
      name: propertyName,
      /** Events carry primitives, never value objects. */
      type: z.enum(['string', 'number', 'boolean', 'Date']),
    }),
  ),
});

export const commandSpec = z.object({
  name: identifier('Command name'),
  description: z.string().min(1),
  properties: z.array(
    z.object({
      name: propertyName,
      type: z.enum(['string', 'number', 'boolean', 'Date']),
    }),
  ),
  /** What the handler returns. `string` is the new aggregate id. */
  returns: z.enum(['void', 'string']).default('void'),
  /** Event names this command is expected to raise. */
  raises: z.array(z.string()).default([]),
});

export const aggregateSpec = z.object({
  /** The aggregate root. */
  name: identifier('Aggregate name'),
  description: z.string().min(1),
  /** Module/folder slug, kebab-case. Derived when the model omits it. */
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'slug must be kebab-case')
    .optional(),
  properties: z.array(aggregatePropertySpec).min(1),
  valueObjects: z.array(valueObjectSpec).default([]),
  events: z.array(domainEventSpec).default([]),
  commands: z.array(commandSpec).default([]),
  /** Aggregate-level invariants spanning more than one property. */
  invariants: z.array(brokenRuleSpec).default([]),
});

export type BrokenRuleSpec = z.infer<typeof brokenRuleSpec>;
export type ValueObjectSpec = z.infer<typeof valueObjectSpec>;
export type AggregatePropertySpec = z.infer<typeof aggregatePropertySpec>;
export type DomainEventSpec = z.infer<typeof domainEventSpec>;
export type CommandSpec = z.infer<typeof commandSpec>;
export type AggregateSpec = z.infer<typeof aggregateSpec>;

/**
 * JSON Schema handed to providers that support constrained decoding.
 * Providers without that capability get it embedded in the prompt instead --
 * either way the response is parsed against `aggregateSpec` before use.
 */
export function aggregateJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(aggregateSpec, { io: 'input' }) as Record<
    string,
    unknown
  >;
}
