export type Severity = 'error' | 'warning';

export interface Finding {
  /** Stable id, so a rule can be referenced in a suppression or a discussion. */
  rule: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  /** Why it matters -- the consequence, not a restatement of the rule. */
  detail: string;
}
