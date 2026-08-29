#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Fixture } from './fixture';
import { runMcpSuite } from './mcp-suite';
import { SUITES } from './scenarios';
import { Expectation, Result, Scenario } from './types';

const CLI = resolve(__dirname, '..', 'dist', 'main.js');
const LIB_VERSION = process.env.ROBOT_LIB_VERSION ?? '4.0.0';

/** Whether a live model is reachable. Decides skip vs run, never pass. */
const hasModelCredentials = (): boolean =>
  Boolean(
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.OPENAI_API_KEY,
  );

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function invoke(scenario: Scenario, cwd: string): Run {
  const result = spawnSync(process.execPath, [CLI, ...scenario.args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Deterministic output: no colour, fixed width, no interactive prompt.
      NO_COLOR: '1',
      COLUMNS: '100',
      ...scenario.env,
    },
    timeout: 120_000,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function check(
  expectation: Expectation,
  run: Run,
  fixture: Fixture,
): string | null {
  const combined = `${run.stdout}${run.stderr}`;

  if (
    expectation.exitCode !== undefined &&
    run.status !== expectation.exitCode
  ) {
    return `expected exit ${expectation.exitCode}, got ${run.status}\n${combined.trim().slice(0, 400)}`;
  }

  for (const pattern of expectation.stdout ?? []) {
    if (!matches(run.stdout, pattern)) {
      return `stdout missing ${describe(pattern)}`;
    }
  }

  for (const pattern of expectation.stderr ?? []) {
    if (!matches(run.stderr, pattern)) {
      return `stderr missing ${describe(pattern)}`;
    }
  }

  for (const pattern of expectation.absent ?? []) {
    if (matches(combined, pattern)) {
      return `output should not contain ${describe(pattern)}`;
    }
  }

  for (const file of expectation.createsFiles ?? []) {
    if (!fixture.has(file)) {
      return `expected ${file} to be written`;
    }
  }

  for (const file of expectation.createsNoFiles ?? []) {
    if (fixture.has(file)) {
      return `${file} should not have been written`;
    }
  }

  if (expectation.compiles) {
    const { ok, output } = fixture.typeCheck();
    if (!ok) {
      return `generated code does not compile\n${output.trim().slice(0, 400)}`;
    }
  }

  return null;
}

const matches = (text: string, pattern: string | RegExp): boolean =>
  typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);

const describe = (pattern: string | RegExp): string =>
  typeof pattern === 'string' ? `"${pattern}"` : String(pattern);

async function main(): Promise<void> {
  if (!existsSync(CLI)) {
    process.stderr.write(
      `\n  The CLI is not built. Run \`npm run build\` first.\n\n`,
    );
    process.exit(1);
  }

  const modelAvailable = hasModelCredentials();
  const fixture = new Fixture(LIB_VERSION);
  const results: Result[] = [];

  process.stdout.write(
    `\n  Acceptance robot — driving the built CLI against a real project\n` +
      `  @nestjslatam/ddd-lib@${LIB_VERSION}` +
      `${modelAvailable ? '' : '   (no model credentials: live-model scenarios will be skipped)'}\n\n`,
  );

  process.stdout.write('  Preparing fixture… ');
  fixture.create();
  process.stdout.write('done\n');

  try {
    for (const suite of SUITES) {
      process.stdout.write(`\n  ${suite.name}\n`);

      for (const scenario of suite.scenarios) {
        const started = Date.now();

        if (scenario.needsModel && !modelAvailable) {
          results.push({
            suite: suite.name,
            scenario: scenario.name,
            outcome: 'skip',
            reason: 'needs model credentials',
            durationMs: 0,
          });
          process.stdout.write(`    skip  ${scenario.name}\n`);
          continue;
        }

        fixture.reset();
        for (const [path, contents] of Object.entries(scenario.files ?? {})) {
          fixture.write(path, contents);
        }

        const run = invoke(scenario, fixture.root);
        const failure = check(scenario.expect, run, fixture);
        const durationMs = Date.now() - started;

        results.push({
          suite: suite.name,
          scenario: scenario.name,
          outcome: failure ? 'fail' : 'pass',
          reason: failure ?? undefined,
          durationMs,
        });

        process.stdout.write(
          `    ${failure ? 'FAIL' : 'pass'}  ${scenario.name}\n`,
        );
        if (failure) {
          for (const line of failure.split('\n')) {
            process.stdout.write(`          ${line}\n`);
          }
        }
      }
    }

    // The MCP surface is driven over stdio rather than by argv, so it gets
    // its own pass rather than being forced into the scenario shape.
    process.stdout.write(`\n  mcp\n`);
    fixture.reset();
    fixture.write(
      'sample.ts',
      'export class Sample {\n  ok(): boolean {\n    return true;\n  }\n}\n',
    );

    for (const result of await runMcpSuite(CLI, fixture.root)) {
      results.push(result);
      process.stdout.write(
        `    ${result.outcome === 'fail' ? 'FAIL' : 'pass'}  ${result.scenario}\n`,
      );
      if (result.reason) {
        process.stdout.write(`          ${result.reason}\n`);
      }
    }
  } finally {
    fixture.destroy();
  }

  report(results);
}

function report(results: Result[]): void {
  const passed = results.filter((r) => r.outcome === 'pass').length;
  const failed = results.filter((r) => r.outcome === 'fail');
  const skipped = results.filter((r) => r.outcome === 'skip');

  process.stdout.write(
    `\n  ${passed} passed, ${failed.length} failed, ${skipped.length} skipped ` +
      `of ${results.length}\n`,
  );

  if (skipped.length) {
    process.stdout.write(
      `\n  Skipped (not tested, not passing):\n` +
        skipped
          .map((r) => `    ${r.suite} · ${r.scenario} — ${r.reason}\n`)
          .join(''),
    );
  }

  if (failed.length) {
    process.stdout.write(
      `\n  Failed:\n` +
        failed.map((r) => `    ${r.suite} · ${r.scenario}\n`).join(''),
    );
  }

  process.stdout.write('\n');

  if (process.env.ROBOT_JSON) {
    writeFileSync(
      join(process.cwd(), process.env.ROBOT_JSON),
      JSON.stringify(
        { results, passed, failed: failed.length, skipped: skipped.length },
        null,
        2,
      ),
    );
  }

  // A robot that always exits 0 gates nothing.
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `\n  Robot crashed: ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});
