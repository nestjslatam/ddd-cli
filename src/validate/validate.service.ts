import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Injectable } from '@nestjs/common';
import * as ts from 'typescript';

import { LibraryIntrospectorService } from '../library/library-introspector.service';
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
  constructor(private readonly library: LibraryIntrospectorService) {}

  /**
   * How the installed library declares `isValid` on DddAggregateRoot.
   *
   * 2.x declared a method there and a getter on the value object; 3.0.0
   * unified on a getter. Reading it rather than assuming keeps the audit
   * correct whichever version the project has.
   */
  private aggregateIsValidShape(): 'getter' | 'method' {
    try {
      const aggregate = this.library.find('DddAggregateRoot');
      const member = aggregate?.members.find((m) => m.name === 'isValid');

      // A getter's declaration reads `get isValid(): boolean`, so matching on
      // `isValid(` alone reports every getter as a method -- the parentheses
      // are there either way. The `get` keyword is the only signal.
      return member && !/\bget\s+isValid\b/.test(member.signature)
        ? 'method'
        : 'getter';
    } catch {
      // No library installed: assume the current shape.
      return 'getter';
    }
  }

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
    const shape = this.aggregateIsValidShape();

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
        aggregateIsValidShape: shape,
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
