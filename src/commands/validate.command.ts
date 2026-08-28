import { resolve } from 'node:path';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ProjectLocatorService } from '../project/project-locator.service';
import { UiService } from '../ui/ui.service';
import { Finding } from '../validate/finding.model';
import { ValidateService } from '../validate/validate.service';

interface ValidateOptions {
  /** Exit non-zero on warnings too, not just errors. */
  strict?: boolean;
}

@Command({
  name: 'validate',
  aliases: ['check'],
  arguments: '[path]',
  description: "Audit code against the library's idiom",
})
export class ValidateCommand extends CommandRunner {
  constructor(
    private readonly validator: ValidateService,
    private readonly locator: ProjectLocatorService,
    private readonly ui: UiService,
  ) {
    super();
  }

  async run(args: string[], options: ValidateOptions = {}): Promise<void> {
    const project = this.locator.locate();
    const target = args[0] ? resolve(args[0]) : project.sourceRoot;

    const findings = this.validator.run(target, project.root);

    if (!findings.length) {
      this.ui.blank();
      this.ui.ok('No idiom violations found.');
      this.ui.blank();
      return;
    }

    this.renderFindings(findings);

    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.length - errors;

    this.ui.blank();
    this.ui.line(
      [
        errors
          ? this.ui.danger(`${errors} error${errors === 1 ? '' : 's'}`)
          : '',
        warnings
          ? this.ui.warning(`${warnings} warning${warnings === 1 ? '' : 's'}`)
          : '',
      ]
        .filter(Boolean)
        .join(this.ui.subtle(' · ')),
    );
    this.ui.blank();

    // A check that always exits 0 is a check nobody can gate on.
    if (errors || (options.strict && warnings)) {
      process.exitCode = 1;
    }
  }

  private renderFindings(findings: Finding[]): void {
    let currentFile = '';

    for (const finding of findings) {
      if (finding.file !== currentFile) {
        currentFile = finding.file;
        this.ui.heading(finding.file);
      }

      const marker =
        finding.severity === 'error'
          ? this.ui.danger('error  ')
          : this.ui.warning('warning');

      this.ui.line(
        `${marker}  ${this.ui.subtle(`${finding.line}`.padStart(4))}  ${finding.message}`,
      );
      this.ui.paragraph(finding.detail, '            ');
      this.ui.line(this.ui.subtle(`            ${finding.rule}`));
      this.ui.blank();
    }
  }

  @Option({
    flags: '-s, --strict',
    description: 'Fail on warnings as well as errors',
  })
  parseStrict(): boolean {
    return true;
  }
}
