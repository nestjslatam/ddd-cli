import { Command, CommandRunner, Option } from 'nest-commander';

import { ArtifactWriterService } from '../project/artifact-writer.service';
import { ProjectLocatorService } from '../project/project-locator.service';
import {
  NewRequest,
  STEREOTYPES,
  StereotypeKind,
  renderStereotype,
} from '../scaffold/stereotype.renderer';
import { UiService } from '../ui/ui.service';

interface NewOptions {
  kind?: 'string' | 'number';
  for?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
}

@Command({
  name: 'new',
  aliases: ['n'],
  arguments: '<stereotype> <Name>',
  description: `Scaffold a single stereotype (${STEREOTYPES.join(', ')})`,
})
export class NewCommand extends CommandRunner {
  constructor(
    private readonly locator: ProjectLocatorService,
    private readonly writer: ArtifactWriterService,
    private readonly ui: UiService,
  ) {
    super();
  }

  async run(args: string[], options: NewOptions = {}): Promise<void> {
    const [stereotype, name] = args;

    if (!STEREOTYPES.includes(stereotype as StereotypeKind)) {
      throw new Error(
        `Unknown stereotype "${stereotype}".\n\n  Available: ${STEREOTYPES.join(', ')}`,
      );
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(name ?? '')) {
      throw new Error(
        `"${name}" is not a valid class name. Use PascalCase, e.g. OrderTotal.`,
      );
    }

    const request: NewRequest = {
      kind: stereotype as StereotypeKind,
      name,
      primitive: options.kind,
      subject: options.for,
    };

    if (request.kind === 'validator' && !request.subject) {
      this.ui.blank();
      this.ui.warn(
        'No --for given, so the validator is typed against `unknown`. ' +
          'Pass --for <Type> to bind it to what it audits.',
      );
    }

    const project = this.locator.locate();
    const artifacts = renderStereotype(request);
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
    this.ui.ok(`${result.written} file(s) written`);
    this.ui.hint(
      `Every generated file carries TODOs marking what only you can decide.`,
    );
    this.ui.blank();
  }

  @Option({
    flags: '-k, --kind <primitive>',
    description: 'For value objects: string or number (default: string)',
  })
  parseKind(value: string): string {
    return value;
  }

  @Option({
    flags: '--for <type>',
    description: 'For validators: the type being audited',
  })
  parseFor(value: string): string {
    return value;
  }

  @Option({ flags: '-d, --dry-run', description: 'Write nothing' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-f, --force', description: 'Overwrite existing files' })
  parseForce(): boolean {
    return true;
  }

  @Option({ flags: '-y, --yes', description: 'Skip the confirmation prompt' })
  parseYes(): boolean {
    return true;
  }
}
