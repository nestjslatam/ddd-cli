/** One file the generator proposes to write. */
export interface Artifact {
  /** Path relative to the project's source root. */
  path: string;
  contents: string;
  /** What this file is, shown in the preview. */
  kind: ArtifactKind;
}

export type ArtifactKind =
  | 'aggregate'
  | 'value-object'
  | 'validator'
  | 'domain-event'
  | 'command'
  | 'command-handler'
  | 'repository'
  | 'module'
  | 'barrel'
  /** A subclass of a base the generator has no more specific name for. */
  | 'subclass';

export function artifact(
  kind: ArtifactKind,
  path: string,
  contents: string,
): Artifact {
  // Every generated file ends with exactly one newline, so a later formatter
  // run produces no diff.
  return { kind, path, contents: contents.replace(/\n*$/, '\n') };
}
