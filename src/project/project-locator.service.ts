import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

export interface ProjectContext {
  /** Directory holding package.json. */
  root: string;
  /** Where generated code goes, absolute. */
  sourceRoot: string;
  /** True when the project already depends on the DDD library. */
  hasDddLib: boolean;
}

/**
 * Locates the NestJS project the generated code belongs to.
 *
 * Walks up from the working directory looking for a package.json, the same way
 * package managers resolve, so the CLI works from any subdirectory.
 */
@Injectable()
export class ProjectLocatorService {
  locate(from: string = process.cwd()): ProjectContext {
    const root = this.findPackageRoot(resolve(from));

    if (!root) {
      throw new Error(
        `No package.json found in ${from} or any parent directory. ` +
          'Run this from inside a NestJS project.',
      );
    }

    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    return {
      root,
      sourceRoot: this.resolveSourceRoot(root),
      hasDddLib: Boolean(manifest.dependencies?.['@nestjslatam/ddd-lib']),
    };
  }

  private findPackageRoot(start: string): string | null {
    let current = start;

    for (;;) {
      if (existsSync(join(current, 'package.json'))) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  /** Honours nest-cli.json's sourceRoot when present, else defaults to src. */
  private resolveSourceRoot(root: string): string {
    const nestCli = join(root, 'nest-cli.json');

    if (existsSync(nestCli)) {
      try {
        const config = JSON.parse(readFileSync(nestCli, 'utf8')) as {
          sourceRoot?: string;
        };
        if (config.sourceRoot) {
          return join(root, config.sourceRoot);
        }
      } catch {
        // A malformed nest-cli.json is the project's problem, not a reason to
        // fail generation. Fall through to the conventional default.
      }
    }

    return join(root, 'src');
  }
}
