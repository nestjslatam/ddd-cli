import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';

import { Finding } from './finding.model';
import { IDIOM_RULES } from './idiom-rules';

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'build',
]);

@Injectable()
export class ValidateService {
  /** Runs every idiom rule over the TypeScript under `root`. */
  run(root: string, projectRoot: string): Finding[] {
    if (!existsSync(root)) {
      // Without this the raw ENOENT from statSync reaches the terminal.
      throw new Error(
        `No such path: ${relative(projectRoot, root) || root}\n\n  ` +
          'Pass a file or directory to scan, or omit the argument to scan the ' +
          "project's source root.",
      );
    }

    const findings: Finding[] = [];

    for (const file of this.sourceFiles(root)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
      );

      // A target outside the project root would otherwise render as a wall of
      // ../.. segments; fall back to a path relative to what was scanned.
      const fromProject = relative(projectRoot, file);
      const context = {
        source,
        file: fromProject.startsWith('..') ? relative(root, file) : fromProject,
      };

      for (const rule of IDIOM_RULES) {
        findings.push(...rule(context));
      }
    }

    return findings.sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
    );
  }

  private sourceFiles(root: string): string[] {
    const found: string[] = [];

    const walk = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        const full = join(dir, entry);

        // statSync follows symlinks, so one dangling link anywhere under the
        // tree threw ENOENT out of the walk and killed the entire audit with
        // a message that read like a CLI bug. Skip what cannot be stat'd.
        let stats;
        try {
          stats = statSync(full);
        } catch {
          continue;
        }

        if (stats.isDirectory()) {
          if (!SKIP_DIRECTORIES.has(entry)) {
            walk(full);
          }
        } else if (
          entry.endsWith('.ts') &&
          !entry.endsWith('.d.ts') &&
          !entry.endsWith('.spec.ts')
        ) {
          found.push(full);
        }
      }
    };

    if (statSync(root).isDirectory()) {
      walk(root);
    } else {
      found.push(root);
    }

    return found;
  }
}
