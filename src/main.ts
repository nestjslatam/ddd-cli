#!/usr/bin/env node
import 'reflect-metadata';

import { LogLevel } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';

import { AppModule } from './app.module';
import { formatError } from './commands/generate-aggregate.command';

/**
 * A CLI should be quiet unless something is wrong, so Nest's bootstrap banner
 * is suppressed and only warnings and errors reach the terminal. DDD_CLI_DEBUG
 * restores the full log for troubleshooting.
 */
const logger: LogLevel[] = process.env.DDD_CLI_DEBUG
  ? ['log', 'error', 'warn', 'debug', 'verbose']
  : ['warn', 'error'];

async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, { logger, cliName: 'ddd' });
}

bootstrap().catch((error: unknown) => {
  console.error(`\n${formatError(error)}\n`);
  process.exitCode = 1;
});
