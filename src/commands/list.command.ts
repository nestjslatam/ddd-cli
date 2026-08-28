import { Command, CommandRunner, Option } from 'nest-commander';

import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { StereotypeFamily, StereotypeRole } from '../library/stereotype.model';
import { bold, cyan, dim, green, yellow } from '../project/ansi';

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

const ROLE_LABEL: Record<StereotypeRole, string> = {
  extend: 'extend   ',
  implement: 'implement',
  compose: 'compose  ',
  use: 'use      ',
};

const ROLE_COLOUR: Record<StereotypeRole, (text: string) => string> = {
  extend: green,
  implement: cyan,
  compose: yellow,
  use: dim,
};

@Command({
  name: 'list',
  aliases: ['ls'],
  description:
    'Inventory every stereotype the library exposes, and how to use each',
})
export class ListCommand extends CommandRunner {
  constructor(private readonly library: LibraryIntrospectorService) {
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
      console.log(dim('\n  Nothing matched that filter.\n'));
      return;
    }

    console.log('');
    console.log(
      dim(
        '  extend = you subclass it   implement = you satisfy the interface\n' +
          '  compose = the aggregate delegates to it   use = call it directly\n',
      ),
    );

    for (const family of FAMILY_ORDER) {
      const inFamily = symbols.filter((s) => s.family === family);
      if (!inFamily.length) {
        continue;
      }

      console.log(bold(`  ${family}`));

      for (const symbol of inFamily) {
        const role = ROLE_COLOUR[symbol.role](ROLE_LABEL[symbol.role]);
        const heritage = symbol.aliasOf
          ? dim(` alias of ${symbol.aliasOf}`)
          : symbol.extends
            ? dim(` extends ${symbol.extends}`)
            : '';
        const contract = symbol.abstractMembers.length
          ? dim(
              `  implement: ${symbol.abstractMembers.map((m) => m.name).join(', ')}`,
            )
          : '';
        console.log(
          `    ${role}  ${symbol.name.padEnd(34)}${heritage}${contract}`,
        );
      }

      console.log('');
    }

    console.log(
      dim(`  ${symbols.length} symbols. `) +
        dim('Run ') +
        cyan('ddd explain <name>') +
        dim(' for any of them.\n'),
    );
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
