/** One end-to-end check against the built CLI binary. */
export interface Scenario {
  /** Short, unique, readable in a report. */
  name: string;
  /** Argv passed to the binary. */
  args: string[];
  /** Extra environment for this run. */
  env?: Record<string, string>;
  /** Files to drop into the fixture's src/ before running. */
  files?: Record<string, string>;
  expect: Expectation;
  /**
   * Set when the scenario needs a live model. The robot skips these -- and
   * says it skipped them -- rather than reporting an untested path as passing.
   */
  needsModel?: boolean;
}

export interface Expectation {
  exitCode?: number;
  /** Every pattern must appear in stdout. */
  stdout?: Array<string | RegExp>;
  /** Every pattern must appear in stderr. */
  stderr?: Array<string | RegExp>;
  /** None of these may appear anywhere in the output. */
  absent?: Array<string | RegExp>;
  /** Files that must exist under the fixture's source root afterwards. */
  createsFiles?: string[];
  /** Files that must NOT exist afterwards -- for --dry-run. */
  createsNoFiles?: string[];
  /** Run tsc over the fixture afterwards and require it to pass. */
  compiles?: boolean;
}

export type Outcome = 'pass' | 'fail' | 'skip';

export interface Result {
  scenario: string;
  suite: string;
  outcome: Outcome;
  /** Why it failed, or why it was skipped. */
  reason?: string;
  durationMs: number;
}

export interface Suite {
  name: string;
  scenarios: Scenario[];
}
