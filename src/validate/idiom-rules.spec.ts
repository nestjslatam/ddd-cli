import * as ts from 'typescript';

import {
  IdiomRule,
  factoryChecksValidity,
  handlerCommitsEvents,
  noSubclassStateInAddValidators,
  superAddValidators,
} from './idiom-rules';

const analyse = (
  rule: IdiomRule,
  code: string,
  aggregateIsValidShape: 'getter' | 'method' = 'getter',
) =>
  rule({
    source: ts.createSourceFile('t.ts', code, ts.ScriptTarget.ES2022, true),
    file: 't.ts',
    aggregateIsValidShape,
  });

describe('idiom rules', () => {
  describe('super-add-validators', () => {
    it('flags an override that drops the base validators', () => {
      expect(
        analyse(
          superAddValidators,
          `class Money extends NumberValueObject {
             override addValidators(): void {
               this.validatorRules.add(new X(this));
             }
           }`,
        ),
      ).toHaveLength(1);
    });

    it('accepts an override that chains', () => {
      expect(
        analyse(
          superAddValidators,
          `class Money extends NumberValueObject {
             override addValidators(): void { super.addValidators(); }
           }`,
        ),
      ).toHaveLength(0);
    });

    it('stays quiet for IdValueObject, whose base registers nothing', () => {
      // Counted at runtime: StringValueObject registers 1 validator,
      // NumberValueObject 2, IdValueObject 0 -- its addValidators() is a bare
      // super call into an empty hook. Flagging it failed builds while
      // claiming, untruthfully, that the base adds rules there.
      expect(
        analyse(
          superAddValidators,
          `class OrderId extends IdValueObject {
             override addValidators(): void {}
           }`,
        ),
      ).toHaveLength(0);
    });

    it('stays quiet for bases whose addValidators is an empty hook', () => {
      // DddValueObject and DddAggregateRoot declare it and do nothing, so a
      // subclass loses nothing by not chaining. Firing here would be noise.
      expect(
        analyse(
          superAddValidators,
          `class Order extends DddAggregateRoot<Order, IProps> {
             addValidators(): void { this.validators.add(new X(this)); }
           }`,
        ),
      ).toHaveLength(0);
    });
  });

  describe('no-subclass-state-in-add-validators', () => {
    it('flags reading a field the constructor assigns after super()', () => {
      // The defect that shipped twice in @nestjslatam/ddd-lib.
      const findings = analyse(
        noSubclassStateInAddValidators,
        `class Money extends NumberValueObject {
           private readonly options: O;
           constructor(v: number, o?: O) {
             super(v);
             this.options = o ?? {};
           }
           override addValidators(): void {
             this.validatorRules.add(new X(this, { allowNaN: this.options.allowNaN }));
           }
         }`,
      );

      expect(findings).toHaveLength(1);
      expect(JSON.stringify(findings)).toContain('this.options');
    });

    it('accepts a field assigned before super is irrelevant to it', () => {
      expect(
        analyse(
          noSubclassStateInAddValidators,
          `class Money extends NumberValueObject {
             constructor(v: number) { super(v); }
             override addValidators(): void { super.addValidators(); }
           }`,
        ),
      ).toHaveLength(0);
    });
  });

  describe('factory-checks-validity', () => {
    it('flags a create() that never checks isValid', () => {
      expect(
        analyse(
          factoryChecksValidity,
          `class Money extends NumberValueObject {
             static create(v: number): Money { return new Money(v); }
           }`,
        ),
      ).toHaveLength(1);
    });

    it('accepts a create() that checks', () => {
      expect(
        analyse(
          factoryChecksValidity,
          `class Money extends NumberValueObject {
             static create(v: number): Money {
               const m = new Money(v);
               if (!m.isValid) throw new Error('bad');
               return m;
             }
           }`,
        ),
      ).toHaveLength(0);
    });
  });

  describe('factory-checks-validity: the shape the installed library declares', () => {
    // ddd-lib 2.x declared isValid as a method on DddAggregateRoot and a
    // getter on DddValueObject; 3.0.0 unified both on a getter. The CLI
    // audits whatever version the project has, so the rule reads the
    // installed declaration rather than assuming one.
    const AGGREGATE_READS = `class Order extends DddAggregateRoot<Order, IProps> {
         static create(p: IProps): Order {
           const o = new Order(p);
           if (!o.isValid) throw new Error('bad');
           return o;
         }
       }`;

    const AGGREGATE_CALLS = `class Order extends DddAggregateRoot<Order, IProps> {
         static create(p: IProps): Order {
           const o = new Order(p);
           if (!o.isValid()) throw new Error('bad');
           return o;
         }
       }`;

    describe('against a library that declares a getter (3.x)', () => {
      it('accepts an aggregate factory that reads it', () => {
        expect(
          analyse(factoryChecksValidity, AGGREGATE_READS, 'getter'),
        ).toHaveLength(0);
      });

      it('flags an aggregate factory that calls it', () => {
        const findings = analyse(
          factoryChecksValidity,
          AGGREGATE_CALLS,
          'getter',
        );

        expect(findings).toHaveLength(1);
        expect(JSON.stringify(findings)).toContain('declares it as a getter');
      });
    });

    describe('against a library that declares a method (2.x)', () => {
      it('flags an aggregate factory that reads it', () => {
        // The silent one: reading a method tests a Function, always truthy,
        // so the guard never fires.
        const findings = analyse(
          factoryChecksValidity,
          AGGREGATE_READS,
          'method',
        );

        expect(findings).toHaveLength(1);
        expect(JSON.stringify(findings)).toContain('declares it as a method');
      });

      it('accepts an aggregate factory that calls it', () => {
        expect(
          analyse(factoryChecksValidity, AGGREGATE_CALLS, 'method'),
        ).toHaveLength(0);
      });
    });

    it('always expects a getter on a value object', () => {
      // DddValueObject declared a getter in every version, so this does not
      // depend on which library is installed.
      const findings = analyse(
        factoryChecksValidity,
        `class Money extends NumberValueObject {
           static create(v: number): Money {
             const m = new Money(v);
             if (!m.isValid()) throw new Error('bad');
             return m;
           }
         }`,
        'method',
      );

      expect(findings).toHaveLength(1);
      expect(JSON.stringify(findings)).toContain('declares it as a getter');
    });
  });

  describe('handler-commits-events', () => {
    it('flags a handler that never dispatches its events', () => {
      expect(
        analyse(
          handlerCommitsEvents,
          `@CommandHandler(PlaceOrder)
           class H { async execute() { await this.repo.save(x); } }`,
        ),
      ).toHaveLength(1);
    });

    it('accepts a handler that merges and commits', () => {
      expect(
        analyse(
          handlerCommitsEvents,
          `@CommandHandler(PlaceOrder)
           class H {
             async execute() {
               const merged = this.publisher.mergeObjectContext(o);
               merged.commit();
             }
           }`,
        ),
      ).toHaveLength(0);
    });

    it('does not mistake a module listing CommandHandlers for a handler', () => {
      // Regression: matching the decorator's text meant every @Module whose
      // providers referenced a `CommandHandlers` array was reported.
      expect(
        analyse(
          handlerCommitsEvents,
          `@Module({ providers: [...CommandHandlers, ...Sagas] })
           export class OrdersModule {}`,
        ),
      ).toHaveLength(0);
    });
  });
});
