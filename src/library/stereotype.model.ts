/** How a stereotype is meant to be used. */
export type StereotypeRole =
  /** Extend it: it defines a contract you implement. */
  | 'extend'
  /** Compose it: the aggregate or value object delegates to it. */
  | 'compose'
  /** Implement it: a contract with no behaviour of its own. */
  | 'implement'
  /** Instantiate or call it directly. */
  | 'use';

/** Families the library's surface falls into. */
export type StereotypeFamily =
  | 'Aggregates'
  | 'Value Objects'
  | 'Validation & Business Rules'
  | 'Domain Events'
  | 'State & Tracking'
  | 'Exceptions'
  | 'Infrastructure';

export interface MemberInfo {
  name: string;
  /** The declaration as written, minus modifiers noise. */
  signature: string;
  isStatic: boolean;
  isAbstract: boolean;
  doc?: string;
}

export interface StereotypeSymbol {
  name: string;
  kind: 'class' | 'interface' | 'type' | 'const' | 'function' | 'enum';
  isAbstract: boolean;
  /** Base class, when the declaration extends one. */
  extends?: string;
  implements: string[];
  typeParameters: string[];
  /** What you must implement to extend this. Empty for non-abstract symbols. */
  abstractMembers: MemberInfo[];
  members: MemberInfo[];
  doc?: string;
  /**
   * Set when the export is an alias, e.g.
   * `export declare const AbstractDomainEvent: typeof DomainEvent`.
   * Worth surfacing: someone reading the library needs to know that two names
   * are the same thing.
   */
  aliasOf?: string;
  /** Path inside the package, for provenance. */
  file: string;
  family: StereotypeFamily;
  role: StereotypeRole;
}
