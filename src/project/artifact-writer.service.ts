import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Injectable } from '@nestjs/common';

import { Artifact } from '../generation/artifact.model';
import { UiService } from '../ui/ui.service';

export interface WritePlan {
  create: Artifact[];
  overwrite: Artifact[];
}

export interface WriteResult {
  written: number;
  skipped: number;
}

/**
 * Previews and writes generated files.
 *
 * Nothing reaches disk before the caller sees the full list and confirms.
 * Files that already exist are listed separately, because overwriting
 * hand-edited domain code is the one mistake a generator must not make quietly.
 */
@Injectable()
export class ArtifactWriterService {
  constructor(private readonly ui: UiService) {}

  plan(artifacts: Artifact[], sourceRoot: string): WritePlan {
    const create: Artifact[] = [];
    const overwrite: Artifact[] = [];
    const root = resolve(sourceRoot);

    for (const item of artifacts) {
      // Every write goes through plan(), so containment is enforced once,
      // here. It matters most over MCP: ddd_extend takes `directory`
      // straight from the calling agent and writes with no preview and no
      // confirmation, and `..` segments escaped the project entirely.
      const destination = resolve(root, item.path);
      if (
        destination !== root &&
        relative(root, destination).startsWith('..')
      ) {
        throw new Error(
          `Refusing to write outside the source root: ${item.path}`,
        );
      }

      (existsSync(join(sourceRoot, item.path)) ? overwrite : create).push(item);
    }

    return { create, overwrite };
  }

  /** Prints the file list, grouped by whether each would be created. */
  renderPreview(plan: WritePlan, sourceRoot: string): void {
    const root = relative(process.cwd(), sourceRoot) || '.';

    this.ui.heading(`Files under ${this.ui.accent(root)}`);

    this.ui.rows([
      ...plan.create.map(
        (item) =>
          [
            this.ui.success(`create  ${item.path}`),
            this.ui.subtle(item.kind),
          ] as [string, string],
      ),
      ...plan.overwrite.map(
        (item) =>
          [
            this.ui.warning(`exists  ${item.path}`),
            this.ui.subtle(item.kind),
          ] as [string, string],
      ),
    ]);

    this.ui.blank();
    this.ui.hint(
      `${plan.create.length} new · ${plan.overwrite.length} already present`,
    );

    if (plan.overwrite.length) {
      this.ui.warn(
        'Existing files are left untouched unless you pass --force.',
      );
    }
  }

  /**
   * Asks for confirmation on stdin. Returns false on anything but y/yes.
   *
   * `rl.question()` neither resolves nor rejects at EOF, so a closed stdin --
   * CI, a redirect from /dev/null, an agent -- left the promise pending: the
   * prompt printed, nothing was written, and the process exited 0 without
   * reporting anything. Settling on `close` and failing loudly is the point;
   * a pipeline that silently generates nothing is the worst outcome.
   *
   * A pipe is not EOF: `echo y | ddd new ...` still answers, so this must not
   * be gated on `process.stdin.isTTY`, which is undefined for a pipe.
   */
  async confirm(question: string): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let closedWithoutAnswer = false;

    try {
      const answer = await new Promise<string>((settle) => {
        rl.once('close', () => {
          closedWithoutAnswer = true;
          settle('');
        });
        rl.question(`  ${question} ${this.ui.muted('(y/N)')} `).then(
          settle,
          () => settle(''),
        );
      });

      if (closedWithoutAnswer) {
        throw new Error(
          'No answer on stdin. Pass --yes to confirm non-interactively.',
        );
      }

      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  }

  write(plan: WritePlan, sourceRoot: string, force: boolean): WriteResult {
    const targets = force ? [...plan.create, ...plan.overwrite] : plan.create;

    for (const item of targets) {
      const destination = join(sourceRoot, item.path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, item.contents, 'utf8');
    }

    return {
      written: targets.length,
      skipped: force ? 0 : plan.overwrite.length,
    };
  }
}
