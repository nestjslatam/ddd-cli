import { Command, CommandRunner, Option } from 'nest-commander';

import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { ArtifactWriterService } from '../project/artifact-writer.service';
import { ProjectLocatorService } from '../project/project-locator.service';
import { ScaffoldService } from '../scaffold/scaffold.service';
import { UiService } from '../ui/ui.service';

interface ExtendOptions {
  directory?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  list?: boolean;
}

@Command({
  name: 'extend',
  aliases: ['x'],
  arguments: '[base] [Name]',
  description:
    "Subclass one of the library's base classes, with its contract stubbed",
})
export class ExtendCommand extends CommandRunner {
  constructor(
    private readonly library: LibraryIntrospectorService,
    private readonly scaffold: ScaffoldService,
    private readonly locator: ProjectLocatorService,
    private readonly writer: ArtifactWriterService,
    private readonly ui: UiService,
  ) {
    super();
  }

  async run(args: string[], options: ExtendOptions = {}): Promise<void> {
    if (options.list || !args.length) {
      this.renderBases();
      return;
    }

    const [baseName, name] = args;

    if (!name) {
      throw new Error(
        `Give the new class a name, e.g. \`ddd extend ${baseName} OrderTotal\`.`,
      );
    }

    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      throw new Error(
        `"${name}" is not a valid class name. Use PascalCase, e.g. OrderTotal.`,
      );
    }

    const base = this.library.find(baseName);
    const directory =
      options.directory ??
      (base ? this.scaffold.defaultDirectory(base, name) : 'domain');

    const artifacts = this.scaffold.extend({ base: baseName, name, directory });
    const resolved = this.library.find(baseName)!;

    const project = this.locator.locate();
    const plan = this.writer.plan(artifacts, project.sourceRoot);

    this.ui.blank();
    this.ui.line(
      `${this.ui.strong(name)} ${this.ui.muted('extends')} ${this.ui.accent(resolved.name)}`,
    );

    if (resolved.abstractMembers.length) {
      this.ui.blank();
      this.ui.hint('Stubbed from the base contract:');
      for (const member of resolved.abstractMembers) {
        this.ui.line(this.ui.success(`  ${member.signature}`));
      }
    }

    this.writer.renderPreview(plan, project.sourceRoot);

    if (options.dryRun) {
      this.ui.hint('Dry run: nothing was written.');
      this.ui.blank();
      return;
    }

    if (!plan.create.length && !options.force) {
      this.ui.hint('That file already exists. Nothing to do.');
      this.ui.blank();
      return;
    }

    const approved =
      options.yes ||
      (await this.writer.confirm(this.ui.strong('Write this file?')));

    if (!approved) {
      this.ui.hint('Cancelled. Nothing was written.');
      this.ui.blank();
      return;
    }

    const result = this.writer.write(plan, project.sourceRoot, !!options.force);

    this.ui.blank();
    this.ui.ok(`${result.written} file(s) written`);

    const followUp = this.scaffold.followUp(resolved, name);
    if (followUp) {
      this.ui.hint(followUp);
    }
    this.ui.blank();
  }

  private renderBases(): void {
    const bases = this.scaffold.extendableBases();

    this.ui.heading('Bases you can extend');
    this.ui.rows(
      bases.map((base) => [
        this.ui.strong(base.name),
        base.abstractMembers.length
          ? this.ui.muted(
              `implement ${base.abstractMembers.map((m) => m.name).join(', ')}`,
            )
          : this.ui.subtle('no abstract members'),
      ]),
    );
    this.ui.blank();
    this.ui.hint(
      `${this.ui.accent('ddd extend <base> <Name>')} to scaffold one.`,
    );
    this.ui.blank();
  }

  @Option({
    flags: '-D, --directory <path>',
    description: 'Destination folder, relative to the source root',
  })
  parseDirectory(value: string): string {
    return value;
  }

  @Option({ flags: '-l, --list', description: 'List the bases and exit' })
  parseList(): boolean {
    return true;
  }

  @Option({ flags: '-d, --dry-run', description: 'Write nothing' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-f, --force', description: 'Overwrite an existing file' })
  parseForce(): boolean {
    return true;
  }

  @Option({ flags: '-y, --yes', description: 'Skip the confirmation prompt' })
  parseYes(): boolean {
    return true;
  }
}
