import { Command, CommandRunner, Option } from 'nest-commander';

import { AggregatePlannerService } from '../generation/aggregate-planner.service';
import { ArtifactGeneratorService } from '../generation/artifact-generator.service';
import { LlmProviderFactory } from '../llm/llm-provider.factory';
import { ArtifactWriterService } from '../project/artifact-writer.service';
import { ProjectLocatorService } from '../project/project-locator.service';
import { UiService } from '../ui/ui.service';

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
    private readonly ui: UiService,
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
      this.ui.blank();
      this.ui.warn(
        `${project.root} does not depend on @nestjslatam/ddd-lib yet — ` +
          'the generated code will not compile until you install it.',
      );
    }

    const provider = this.providers.create({
      provider: options.provider,
      model: options.model,
    });

    this.ui.blank();
    this.ui.hint(`Modelling with ${provider.id} (${provider.model})…`);

    const spec = await this.planner.plan(provider, description);

    this.ui.heading('Model');
    this.ui.rows(
      this.generator.summarise(spec).map((line) => {
        const [label, ...rest] = line.split(/\s{2,}/);
        return [this.ui.muted(label), rest.join(' ')] as [string, string];
      }),
    );

    const artifacts = this.generator.generate(spec);
    const plan = this.writer.plan(artifacts, project.sourceRoot);

    this.writer.renderPreview(plan, project.sourceRoot);

    if (options.dryRun) {
      this.ui.hint('Dry run: nothing was written.');
      this.ui.blank();
      return;
    }

    if (!plan.create.length && !options.force) {
      this.ui.hint('Every file already exists. Nothing to do.');
      this.ui.blank();
      return;
    }

    const approved =
      options.yes ||
      (await this.writer.confirm(this.ui.strong('Write these files?')));

    if (!approved) {
      this.ui.hint('Cancelled. Nothing was written.');
      this.ui.blank();
      return;
    }

    const result = this.writer.write(plan, project.sourceRoot, !!options.force);

    this.ui.blank();
    this.ui.ok(
      `${result.written} file(s) written` +
        (result.skipped
          ? `, ${result.skipped} left alone — pass --force to overwrite`
          : ''),
    );
    this.ui.hint(
      `Register ${this.ui.accent(`${spec.name}Module`)} in your application module to wire it up.`,
    );
    this.ui.blank();
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
