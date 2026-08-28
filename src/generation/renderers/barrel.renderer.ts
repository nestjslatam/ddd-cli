import { Artifact, artifact } from '../artifact.model';

/**
 * Emits an index.ts re-exporting sibling modules.
 *
 * The repositories in this ecosystem import through barrels
 * (`from './validators'`), so generated folders need one to match.
 */
export function renderBarrel(path: string, moduleStems: string[]): Artifact {
  const exports = [...moduleStems]
    .sort()
    .map((stem) => `export * from './${stem}';`)
    .join('\n');

  return artifact('barrel', path, exports);
}
