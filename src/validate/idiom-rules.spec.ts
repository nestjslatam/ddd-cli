import * as ts from 'typescript';

import {
  factoryChecksValidity,
  handlerCommitsEvents,
  noSubclassStateInAddValidators,
  superAddValidators,
} from './idiom-rules';

const analyse = (
  rule: (c: { source: ts.SourceFile; file: string }) => unknown[],
  code: string,
) =>
  rule({
    source: ts.createSourceFile('t.ts', code, ts.ScriptTarget.ES2022, true),
    file: 't.ts',
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

  describe('factory-checks-validity: the two isValid shapes', () => {
    // DddAggregateRoot declares `isValid(): boolean`; DddValueObject declares
    // `get isValid(): boolean`. The rule used to accept any body containing
    // the substring, which is why generated aggregates shipped with a guard
    // that could never fire.
    it('flags an aggregate factory that reads isValid as a property', () => {
      const findings = analyse(
        factoryChecksValidity,
        `class Order extends DddAggregateRoot<Order, IProps> {
           static create(p: IProps): Order {
             const o = new Order(p);
             if (!o.isValid) throw new Error('bad');
             return o;
           }
         }`,
      );

      expect(findings).toHaveLength(1);
      expect(JSON.stringify(findings)).toContain('method on DddAggregateRoot');
    });

    it('accepts an aggregate factory that calls it', () => {
      expect(
        analyse(
          factoryChecksValidity,
          `class Order extends DddAggregateRoot<Order, IProps> {
             static create(p: IProps): Order {
               const o = new Order(p);
               if (!o.isValid()) throw new Error('bad');
               return o;
             }
           }`,
        ),
      ).toHaveLength(0);
    });

    it('flags a value object factory that calls the getter', () => {
      const findings = analyse(
        factoryChecksValidity,
        `class Money extends NumberValueObject {
           static create(v: number): Money {
             const m = new Money(v);
             if (!m.isValid()) throw new Error('bad');
             return m;
           }
         }`,
      );

      expect(findings).toHaveLength(1);
      expect(JSON.stringify(findings)).toContain('getter on DddValueObject');
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
