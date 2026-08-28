import { Command, CommandRunner, Option } from 'nest-commander';

import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { StereotypeFamily, StereotypeRole } from '../library/stereotype.model';
import { UiService } from '../ui/ui.service';

interface ListOptions {
  family?: string;
  role?: string;
}

const FAMILY_ORDER: StereotypeFamily[] = [
  'Aggregates',
  'Value Objects',
  'Validation & Business Rules',
  'Domain Events',
  'State & Tracking',
  'Exceptions',
  'Infrastructure',
];

const ROLE_HELP: Record<StereotypeRole, string> = {
  extend: 'subclass it',
  implement: 'satisfy the interface',
  compose: 'the aggregate delegates to it',
  use: 'call it directly',
};

@Command({
  name: 'list',
  aliases: ['ls'],
  description:
    'Inventory every stereotype the library exposes, and how to use each',
})
export class ListCommand extends CommandRunner {
  constructor(
    private readonly library: LibraryIntrospectorService,
    private readonly ui: UiService,
  ) {
    super();
  }

  async run(_args: string[], options: ListOptions = {}): Promise<void> {
    let symbols = this.library.read();

    if (options.family) {
      const wanted = options.family.toLowerCase();
      symbols = symbols.filter((s) => s.family.toLowerCase().includes(wanted));
    }

    if (options.role) {
      symbols = symbols.filter((s) => s.role === options.role);
    }

    if (!symbols.length) {
      this.ui.blank();
      this.ui.hint('Nothing matched that filter.');
      this.ui.blank();
      return;
    }

    this.renderLegend();

    for (const family of FAMILY_ORDER) {
      const inFamily = symbols.filter((s) => s.family === family);
      if (!inFamily.length) {
        continue;
      }

      this.ui.heading(family);
      this.ui.rows(
        inFamily.map((symbol) => [
          `${this.paintRole(symbol.role)}  ${this.ui.strong(symbol.name)}`,
          this.detail(symbol),
        ]),
      );
    }

    this.ui.blank();
    this.ui.hint(
      `${symbols.length} symbols · ${this.ui.accent('ddd explain <name>')} ` +
        `${this.ui.muted('for any of them')}`,
    );
    this.ui.blank();
  }

  private renderLegend(): void {
    this.ui.blank();
    this.ui.rows(
      (Object.keys(ROLE_HELP) as StereotypeRole[]).map((role) => [
        this.paintRole(role),
        this.ui.muted(ROLE_HELP[role]),
      ]),
    );
  }

  private paintRole(role: StereotypeRole): string {
    const label = role.padEnd(9);
    switch (role) {
      case 'extend':
        return this.ui.success(label);
      case 'implement':
        return this.ui.accent(label);
      case 'compose':
        return this.ui.warning(label);
      default:
        return this.ui.subtle(label);
    }
  }

  private detail(symbol: {
    aliasOf?: string;
    extends?: string;
    abstractMembers: Array<{ name: string }>;
  }): string {
    const parts: string[] = [];

    if (symbol.aliasOf) {
      parts.push(this.ui.muted(`alias of ${symbol.aliasOf}`));
    } else if (symbol.extends) {
      parts.push(this.ui.muted(`extends ${symbol.extends}`));
    }

    if (symbol.abstractMembers.length) {
      parts.push(
        this.ui.subtle(
          `implement ${symbol.abstractMembers.map((m) => m.name).join(', ')}`,
        ),
      );
    }

    return parts.join(this.ui.subtle(' · '));
  }

  @Option({
    flags: '-f, --family <family>',
    description:
      'Filter by family, e.g. "validation", "value", "aggregate", "event"',
  })
  parseFamily(value: string): string {
    return value;
  }

  @Option({
    flags: '-r, --role <role>',
    description: 'Filter by role: extend, implement, compose or use',
  })
  parseRole(value: string): string {
    return value;
  }
}
