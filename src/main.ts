#!/usr/bin/env node
import 'reflect-metadata';

import { LogLevel } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { AppModule } from './app.module';
import { detectDepth, paint } from './ui/theme';

/**
 * A CLI should be quiet unless something is wrong, so Nest's bootstrap banner
 * is suppressed and only warnings and errors reach the terminal.
 * DDD_CLI_DEBUG restores the full log for troubleshooting.
 */
const logger: LogLevel[] = process.env.DDD_CLI_DEBUG
  ? ['log', 'error', 'warn', 'debug', 'verbose']
  : ['warn', 'error'];

/**
 * Reports a failure and fails.
 *
 * nest-commander catches errors thrown from a command and logs them, which
 * leaves the process exiting 0 with the message on stdout -- a script calling
 * this CLI cannot tell success from failure. Both handlers below put the
 * message on stderr and set a non-zero exit code.
 *
 * The theme helpers are plain functions rather than the injected UiService,
 * because an error can arrive before the Nest context exists.
 */
function reportFailure(error: Error): void {
  // Commander signals --help and --version by throwing. Those are successful
  // outcomes, not failures, and reporting them as errors would make the CLI
  // look broken every time someone asks it for help.
  const code = (error as { code?: string }).code ?? '';
  if (
    code.startsWith('commander.help') ||
    code.startsWith('commander.version')
  ) {
    return;
  }

  const depth = detectDepth(process.env, Boolean(process.stderr.isTTY));
  const label = paint('danger', 'Error', depth);

  process.stderr.write(`\n  ${label}  ${error.message}\n\n`);
  process.exitCode = 1;
}

async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, {
    logger,
    cliName: 'ddd',
    // Thrown by a command's run().
    serviceErrorHandler: reportFailure,
    // Thrown while parsing arguments.
    errorHandler: reportFailure,
  });
}

bootstrap().catch((error: unknown) => {
  reportFailure(error instanceof Error ? error : new Error(String(error)));
});
