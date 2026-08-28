import { Suite } from '../types';

/** A value object that breaks three idiom rules at once. */
const BROKEN_VALUE_OBJECT = `import { NumberValueObject, NumberNotNullValidator } from '@nestjslatam/ddd-lib';

export class BadMoney extends NumberValueObject {
  private readonly opts: { allowNaN: boolean };

  constructor(value: number, opts?: { allowNaN: boolean }) {
    super(value);
    this.opts = opts ?? { allowNaN: false };
  }

  static create(value: number): BadMoney {
    return new BadMoney(value);
  }

  override addValidators(): void {
    this.validatorRules.add(
      new NumberNotNullValidator(this, { allowNaN: this.opts.allowNaN }),
    );
  }
}
`;

/** A module whose providers mention CommandHandlers -- the false positive. */
const MODULE_WITH_HANDLERS = `import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

const CommandHandlers = [];

@Module({ imports: [CqrsModule], providers: [...CommandHandlers] })
export class OrdersModule {}
`;

const CLEAN_CODE = `export class Fine {
  greet(): string {
    return 'ok';
  }
}
`;

const WEAK_FACTORY = `import { StringValueObject } from '@nestjslatam/ddd-lib';

export class Weak extends StringValueObject {
  static create(value: string): Weak {
    return new Weak(value);
  }
}
`;

/**
 * Matches any ANSI escape sequence, for the NO_COLOR check.
 * The control character is the point of the assertion, hence the disable.
 */
// eslint-disable-next-line no-control-regex
const ANY_ESCAPE = /\x1b\[/;

export const SUITES: Suite[] = [
  {
    name: 'root',
    scenarios: [
      {
        name: 'lists every command in help',
        args: ['--help'],
        expect: {
          exitCode: 0,
          stdout: [
            'generate:aggregate',
            'list',
            'explain',
            'new',
            'extend',
            'validate',
          ],
          // Commander signals help by throwing; reporting that as a failure
          // made the CLI look broken every time someone asked for help.
          absent: [/Error/],
        },
      },
      {
        name: 'rejects an unknown command',
        args: ['no-such-command'],
        expect: { exitCode: 1 },
      },
    ],
  },

  {
    name: 'list',
    scenarios: [
      {
        name: 'reports every family',
        args: ['list'],
        expect: {
          exitCode: 0,
          stdout: [
            'Aggregates',
            'Value Objects',
            'Validation & Business Rules',
            'Domain Events',
            'Exceptions',
          ],
        },
      },
      {
        name: 'filters by family',
        args: ['list', '--family', 'validation'],
        expect: {
          exitCode: 0,
          stdout: ['AbstractRuleValidator', 'BrokenRulesManager'],
          absent: ['DddAggregateRoot'],
        },
      },
      {
        name: 'filters by role',
        args: ['list', '--role', 'extend'],
        expect: {
          exitCode: 0,
          stdout: ['DddAggregateRoot', 'AbstractValidator'],
        },
      },
      {
        name: 'shows the abstract contract inline',
        args: ['list', '--role', 'extend'],
        expect: { exitCode: 0, stdout: ['implement addRules'] },
      },
      {
        name: 'resolves an aliased export to its target',
        args: ['list', '--family', 'event'],
        expect: { exitCode: 0, stdout: ['alias of DomainEvent'] },
      },
      {
        name: 'says so when a filter matches nothing',
        args: ['list', '--family', 'nonsense'],
        expect: { exitCode: 0, stdout: ['Nothing matched'] },
      },
      {
        name: 'emits no escape sequences when NO_COLOR is set',
        args: ['list', '--role', 'compose'],
        env: { NO_COLOR: '1', FORCE_COLOR: '1' },
        expect: { exitCode: 0, absent: [ANY_ESCAPE] },
      },
    ],
  },

  {
    name: 'explain',
    scenarios: [
      {
        name: 'prints the declaration without calling a model',
        args: ['explain', 'AbstractRuleValidator', '--raw'],
        expect: {
          exitCode: 0,
          stdout: [
            'abstract class AbstractRuleValidator',
            'You must implement',
            'addRules',
          ],
        },
      },
      {
        name: 'finds a symbol case-insensitively',
        args: ['explain', 'brokenrulesmanager', '--raw'],
        expect: { exitCode: 0, stdout: ['BrokenRulesManager'] },
      },
      {
        name: 'flags an aliased export',
        args: ['explain', 'AbstractDomainEvent', '--raw'],
        expect: { exitCode: 0, stdout: ['Alias for DomainEvent'] },
      },
      {
        name: 'suggests a near miss on a dropped plural',
        args: ['explain', 'BrokenRuleManager', '--raw'],
        expect: { exitCode: 1, stderr: ['BrokenRulesManager'] },
      },
      {
        name: 'suggests a near miss on a single-character slip',
        args: ['explain', 'AbstractRuleValidatr', '--raw'],
        expect: { exitCode: 1, stderr: ['AbstractRuleValidator'] },
      },
      {
        name: 'points at list when nothing is close',
        args: ['explain', 'Zzzzzz', '--raw'],
        expect: { exitCode: 1, stderr: ['ddd list'] },
      },
      {
        name: 'explains against a live model',
        args: ['explain', 'AbstractRuleValidator'],
        needsModel: true,
        expect: { exitCode: 0, stdout: ['WHAT IT IS', 'HOW TO USE IT'] },
      },
    ],
  },

  {
    name: 'new',
    scenarios: [
      {
        name: 'scaffolds a number value object that compiles',
        args: ['new', 'value-object', 'OrderTotal', '--kind', 'number', '-y'],
        expect: {
          exitCode: 0,
          createsFiles: ['shared/valueobjects/order-total.ts'],
          compiles: true,
        },
      },
      {
        name: 'defaults a value object to string',
        args: ['new', 'value-object', 'Sku', '-y'],
        expect: {
          exitCode: 0,
          createsFiles: ['shared/valueobjects/sku.ts'],
          compiles: true,
        },
      },
      {
        name: 'scaffolds an aggregate that compiles',
        args: ['new', 'aggregate', 'Order', '-y'],
        expect: {
          exitCode: 0,
          createsFiles: ['order/domain/order-aggregate/order.ts'],
          compiles: true,
        },
      },
      {
        name: 'suffixes an event name',
        args: ['new', 'event', 'OrderPlaced', '-y'],
        expect: {
          exitCode: 0,
          createsFiles: ['domain/events/order-placed-event.ts'],
          compiles: true,
        },
      },
      {
        name: 'suffixes an exception name',
        args: ['new', 'exception', 'OrderClosed', '-y'],
        expect: {
          exitCode: 0,
          createsFiles: ['shared/exceptions/order-closed-exception.ts'],
          compiles: true,
        },
      },
      {
        name: 'warns when a validator has no subject',
        args: ['new', 'validator', 'OrderRules', '-y'],
        expect: { exitCode: 0, stdout: ['No --for given'] },
      },
      {
        name: 'writes nothing on a dry run',
        args: ['new', 'value-object', 'Ghost', '--dry-run'],
        expect: {
          exitCode: 0,
          stdout: ['Dry run'],
          createsNoFiles: ['shared/valueobjects/ghost.ts'],
        },
      },
      {
        name: 'rejects an unknown stereotype',
        args: ['new', 'widget', 'Thing', '-y'],
        expect: { exitCode: 1, stderr: ['Unknown stereotype'] },
      },
      {
        name: 'rejects a non-PascalCase name',
        args: ['new', 'value-object', 'orderTotal', '-y'],
        expect: { exitCode: 1, stderr: ['PascalCase'] },
      },
      {
        name: 'leaves an existing file alone without --force',
        args: ['new', 'value-object', 'Existing', '-y'],
        files: { 'shared/valueobjects/existing.ts': 'export const x = 1;\n' },
        expect: { exitCode: 0, stdout: ['already exist'] },
      },
    ],
  },

  {
    name: 'extend',
    scenarios: [
      {
        name: 'lists the extendable bases',
        args: ['extend', '--list'],
        expect: {
          exitCode: 0,
          stdout: ['AbstractRuleValidator', 'implement addRules'],
        },
      },
      {
        name: 'lists bases when called with no arguments',
        args: ['extend'],
        expect: { exitCode: 0, stdout: ['Bases you can extend'] },
      },
      {
        name: 'stubs the contract and compiles',
        args: ['extend', 'AbstractRuleValidator', 'OrderRules', '-y'],
        expect: {
          exitCode: 0,
          stdout: ['addRules'],
          createsFiles: ['shared/valueobjects/validators/order-rules.ts'],
          compiles: true,
        },
      },
      {
        name: 'honours an explicit directory',
        args: [
          'extend',
          'DomainException',
          'OrderClosed',
          '--directory',
          'errors',
          '-y',
        ],
        expect: { exitCode: 0, createsFiles: ['errors/order-closed.ts'] },
      },
      {
        name: 'explains why a collaborator cannot be subclassed',
        args: ['extend', 'BrokenRulesManager', 'X', '-y'],
        expect: { exitCode: 1, stderr: ['collaborator'] },
      },
      {
        name: 'explains why an interface cannot be subclassed',
        args: ['extend', 'IRuleValidator', 'X', '-y'],
        expect: { exitCode: 1, stderr: ['interface'] },
      },
      {
        name: 'asks for a name when only a base is given',
        args: ['extend', 'AbstractRuleValidator'],
        expect: { exitCode: 1, stderr: ['name'] },
      },
      {
        name: 'suggests a near-miss base',
        args: ['extend', 'AbstractRuleValidatr', 'X', '-y'],
        expect: { exitCode: 1, stderr: ['AbstractRuleValidator'] },
      },
    ],
  },

  {
    name: 'validate',
    scenarios: [
      {
        name: 'passes clean code',
        args: ['validate'],
        files: { 'ok.ts': CLEAN_CODE },
        expect: { exitCode: 0, stdout: ['No idiom violations'] },
      },
      {
        name: 'catches the construction-order defect that shipped twice',
        args: ['validate'],
        files: { 'bad-money.ts': BROKEN_VALUE_OBJECT },
        expect: {
          exitCode: 1,
          stdout: [
            'no-subclass-state-in-add-validators',
            'super-add-validators',
            'factory-checks-validity',
          ],
        },
      },
      {
        name: 'does not mistake a module for a command handler',
        args: ['validate'],
        files: { 'orders.module.ts': MODULE_WITH_HANDLERS },
        expect: { exitCode: 0, absent: ['handler-commits-events'] },
      },
      {
        name: 'fails on warnings under --strict',
        args: ['validate', '--strict'],
        files: { 'weak.ts': WEAK_FACTORY },
        expect: { exitCode: 1, stdout: ['factory-checks-validity'] },
      },
      {
        name: 'reports a missing path in its own words',
        args: ['validate', 'no-such-directory'],
        expect: { exitCode: 1, stderr: ['No such path'], absent: ['ENOENT'] },
      },
    ],
  },

  {
    name: 'generate:aggregate',
    scenarios: [
      {
        name: 'requires a description',
        args: ['generate:aggregate', ' '],
        expect: { exitCode: 1 },
      },
      {
        name: 'models an aggregate against a live model',
        args: [
          'generate:aggregate',
          'An order has a customer name and a positive total.',
          '--dry-run',
        ],
        needsModel: true,
        expect: { exitCode: 0, stdout: ['aggregate', 'Files under'] },
      },
    ],
  },
];
