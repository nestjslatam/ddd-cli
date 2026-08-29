import { LibraryIntrospectorService } from '../library/library-introspector.service';
import { ScaffoldService } from './scaffold.service';
import { StereotypeSymbol } from '../library/stereotype.model';

/**
 * The write preview's label is the only description a user gets before
 * confirming a write, so a wrong one is worse than a vague one.
 *
 * `extend` hardcoded 'aggregate' for every base it was given, which meant
 * `ddd extend StringValueObject Sku` announced it was about to write an
 * aggregate. The kind is derived from the base's lineage now.
 */
describe('the kind `extend` reports for what it writes', () => {
  const base = (name: string, extendsFrom?: string): StereotypeSymbol =>
    ({
      name,
      kind: 'class',
      isAbstract: true,
      extends: extendsFrom,
      implements: [],
      typeParameters: [],
      abstractMembers: [],
      members: [],
      role: 'extend',
    }) as unknown as StereotypeSymbol;

  const kindFor = (symbol: StereotypeSymbol): string => {
    const service = new ScaffoldService({
      find: () => symbol,
      read: () => [symbol],
      suggest: () => [],
    } as unknown as LibraryIntrospectorService);

    return service.extend({
      base: symbol.name,
      name: 'Foo',
      directory: 'domain',
    })[0].kind;
  };

  it.each([
    ['StringValueObject', undefined, 'value-object'],
    ['NumberValueObject', undefined, 'value-object'],
    ['AbstractRuleValidator', undefined, 'validator'],
    ['DddAggregateRoot', undefined, 'aggregate'],
    ['DomainEvent', undefined, 'domain-event'],
  ])('reports %s as %s', (name, extendsFrom, expected) => {
    expect(kindFor(base(name, extendsFrom))).toBe(expected);
  });

  it('reads the lineage, not just the name', () => {
    // The point of `extend` is that it works for bases it has never seen,
    // including ones a user added to their own fork.
    expect(kindFor(base('Sku', 'StringValueObject'))).toBe('value-object');
  });

  it('says subclass rather than guessing when nothing matches', () => {
    expect(kindFor(base('SomethingElse'))).toBe('subclass');
  });
});
