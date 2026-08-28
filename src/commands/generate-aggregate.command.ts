import { Command, CommandRunner, Option } from 'nest-commander';

import { AggregatePlannerService } from '../generation/aggregate-planner.service';
import { ArtifactGeneratorService } from '../generation/artifact-generator.service';
import { LlmProviderFactory } from '../llm/llm-provider.factory';
import { bold, cyan, dim, green, red } from '../project/ansi';
import { ArtifactWriterService } from '../project/artifact-writer.service';
import { ProjectLocatorService } from '../project/project-locator.service';

interface GenerateAggregateOptions {
  provider?: string;
  model?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
}

@Command({
  name: 'generate:aggregate',
  aliases: ['ga'],
  arguments: '<description...>',
  description:
    'Model an aggregate from a plain-language domain description and generate its DDD artifacts',
})
export class GenerateAggregateCommand extends CommandRunner {
  constructor(
    private readonly providers: LlmProviderFactory,
    private readonly planner: AggregatePlannerService,
    private readonly generator: ArtifactGeneratorService,
    private readonly locator: ProjectLocatorService,
    private readonly writer: ArtifactWriterService,
  ) {
    super();
  }

  async run(
    args: string[],
    options: GenerateAggregateOptions = {},
  ): Promise<void> {
    const description = args.join(' ').trim();

    if (!description) {
      throw new Error('Describe the domain you want modelled.');
    }

    const project = this.locator.locate();

    if (!project.hasDddLib) {
      console.log(
        dim(
          `  Note: ${project.root} does not depend on @nestjslatam/ddd-lib yet. ` +
            'The generated code will not compile until you install it.',
        ),
      );
    }

    const provider = this.providers.create({
      provider: options.provider,
      model: options.model,
    });

    console.log(
      dim(`\n  Modelling with ${provider.id} (${provider.model})...`),
    );

    const spec = await this.planner.plan(provider, description);

    console.log('');
    for (const line of this.generator.summarise(spec)) {
      console.log(`  ${dim(line)}`);
    }

    const artifacts = this.generator.generate(spec);
    const plan = this.writer.plan(artifacts, project.sourceRoot);

    console.log(this.writer.renderPreview(plan, project.sourceRoot));

    if (options.dryRun) {
      console.log(dim('  Dry run: nothing was written.\n'));
      return;
    }

    if (!plan.create.length && !options.force) {
      console.log(dim('  Every file already exists. Nothing to do.\n'));
      return;
    }

    const approved =
      options.yes || (await this.writer.confirm(bold('Write these files?')));

    if (!approved) {
      console.log(dim('  Cancelled. Nothing was written.\n'));
      return;
    }

    const result = this.writer.write(plan, project.sourceRoot, !!options.force);

    console.log(
      `\n  ${green('Done.')} ${result.written} file(s) written` +
        (result.skipped
          ? `, ${result.skipped} left alone (pass --force to overwrite)`
          : '') +
        '.\n',
    );
    console.log(
      dim(
        `  Register ${cyan(`${spec.name}Module`)} in your application module to wire it up.\n`,
      ),
    );
  }

  @Option({
    flags: '-p, --provider <provider>',
    description:
      'Model provider: anthropic or openai (auto-detected by default)',
  })
  parseProvider(value: string): string {
    return value;
  }

  @Option({
    flags: '-m, --model <model>',
    description: "Model id, overriding the provider's default",
  })
  parseModel(value: string): string {
    return value;
  }

  @Option({
    flags: '-d, --dry-run',
    description: 'Show what would be generated without writing anything',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '-f, --force',
    description: 'Overwrite files that already exist',
  })
  parseForce(): boolean {
    return true;
  }

  @Option({
    flags: '-y, --yes',
    description: 'Skip the confirmation prompt',
  })
  parseYes(): boolean {
    return true;
  }
}

/** Exported for the error path in main.ts. */
export const formatError = (error: unknown): string =>
  `${red('Error:')} ${error instanceof Error ? error.message : String(error)}`;
