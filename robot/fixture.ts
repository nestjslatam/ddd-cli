import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const TSCONFIG = {
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2022',
    lib: ['ES2022'],
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    esModuleInterop: true,
    moduleResolution: 'node',
  },
  include: ['src/**/*'],
};

/**
 * A disposable NestJS project for the CLI to act on.
 *
 * Built once and reset between scenarios: installing the dependency tree takes
 * far longer than every scenario combined, and a fresh install per scenario
 * would make the robot too slow to run often enough to be useful.
 */
export class Fixture {
  readonly root: string;

  constructor(private readonly libVersion: string) {
    this.root = join(tmpdir(), `ddd-cli-robot-${process.pid}`);
  }

  get sourceRoot(): string {
    return join(this.root, 'src');
  }

  /** Installs the dependency tree. Slow; called once. */
  create(): void {
    rmSync(this.root, { recursive: true, force: true });
    mkdirSync(this.sourceRoot, { recursive: true });

    writeFileSync(
      join(this.root, 'package.json'),
      JSON.stringify(
        { name: 'robot-fixture', version: '1.0.0', private: true },
        null,
        2,
      ),
    );
    writeFileSync(
      join(this.root, 'tsconfig.json'),
      JSON.stringify(TSCONFIG, null, 2),
    );

    execFileSync(
      'npm',
      [
        'install',
        '--silent',
        '--no-audit',
        '--no-fund',
        `@nestjslatam/ddd-lib@${this.libVersion}`,
        '@nestjs/common@^11',
        '@nestjs/core@^11',
        '@nestjs/cqrs@^11',
        'reflect-metadata@^0.2',
        'rxjs@^7',
        'typescript@^5.9',
      ],
      { cwd: this.root, stdio: 'ignore' },
    );
  }

  /** Empties src/ so each scenario starts from the same state. */
  reset(): void {
    rmSync(this.sourceRoot, { recursive: true, force: true });
    mkdirSync(this.sourceRoot, { recursive: true });
  }

  write(relativePath: string, contents: string): void {
    const destination = join(this.sourceRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }

  has(relativePath: string): boolean {
    return existsSync(join(this.sourceRoot, relativePath));
  }

  /** Type-checks the fixture. Returns compiler output on failure. */
  typeCheck(): { ok: boolean; output: string } {
    try {
      execFileSync('npx', ['tsc', '--noEmit'], {
        cwd: this.root,
        stdio: 'pipe',
      });
      return { ok: true, output: '' };
    } catch (error) {
      const output = error as { stdout?: Buffer; stderr?: Buffer };
      return {
        ok: false,
        output: `${output.stdout?.toString() ?? ''}${output.stderr?.toString() ?? ''}`,
      };
    }
  }

  destroy(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}
