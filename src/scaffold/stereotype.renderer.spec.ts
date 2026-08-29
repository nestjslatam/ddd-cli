import { renderStereotype } from './stereotype.renderer';

describe('stereotype templates', () => {
  it('gives a value object a factory that checks validity', () => {
    // The library collects broken rules rather than throwing, so a template
    // without this check would scaffold the very bug `ddd validate` reports.
    const [file] = renderStereotype({
      kind: 'value-object',
      name: 'OrderTotal',
      primitive: 'number',
    });

    expect(file.contents).toContain('extends NumberValueObject');
    expect(file.contents).toContain('if (!instance.isValid)');
    expect(file.contents).toContain('super.addValidators()');
    expect(file.path).toBe('shared/valueobjects/order-total.ts');
  });

  it('defaults a value object to string', () => {
    const [file] = renderStereotype({ kind: 'value-object', name: 'Sku' });
    expect(file.contents).toContain('extends StringValueObject');
  });

  it('suffixes an event name when the caller omits it', () => {
    const [file] = renderStereotype({ kind: 'event', name: 'OrderPlaced' });
    expect(file.contents).toContain('class OrderPlacedEvent');
    expect(file.contents).toContain('static fromJSON');
  });

  it('does not redeclare aggregateId on an event', () => {
    // The base exposes it as an accessor derived from the metadata; declaring
    // it as a constructor property is a type error (TS2610). The unit tests
    // missed this because they only read the string -- the robot caught it by
    // compiling the result.
    const [file] = renderStereotype({ kind: 'event', name: 'OrderPlaced' });
    expect(file.contents).not.toContain('readonly aggregateId');
  });

  it('suffixes an exception name when the caller omits it', () => {
    const [file] = renderStereotype({ kind: 'exception', name: 'OrderClosed' });
    expect(file.contents).toContain('class OrderClosedException');
    expect(file.contents).toContain('extends DomainException');
  });

  it('binds a validator to its subject when told', () => {
    const [file] = renderStereotype({
      kind: 'validator',
      name: 'OrderTotalRules',
      subject: 'OrderTotal',
    });
    expect(file.contents).toContain('AbstractRuleValidator<OrderTotal>');
  });

  it('scaffolds an aggregate with private constructor and factories', () => {
    const [file] = renderStereotype({ kind: 'aggregate', name: 'Order' });
    expect(file.contents).toContain('private constructor');
    expect(file.contents).toContain('static create');
    expect(file.contents).toContain('static load');
    expect(file.contents).toContain('markAsClean');
  });

  it('reports each stereotype as what it actually is', () => {
    // Every one of these was mislabelled: an exception announced itself as a
    // validator and an enum as a value object. The label is the only
    // description a user -- or an agent over MCP -- gets before confirming a
    // write, so a wrong one is worse than a vague one.
    const kindOf = (request: Parameters<typeof renderStereotype>[0]) =>
      renderStereotype(request)[0].kind;

    expect(kindOf({ kind: 'value-object', name: 'Sku' })).toBe('value-object');
    expect(
      kindOf({ kind: 'validator', name: 'SkuRules', subject: 'Sku' }),
    ).toBe('validator');
    expect(kindOf({ kind: 'event', name: 'OrderPlaced' })).toBe('domain-event');
    expect(kindOf({ kind: 'exception', name: 'OrderClosed' })).toBe(
      'exception',
    );
    expect(kindOf({ kind: 'aggregate', name: 'Order' })).toBe('aggregate');
    expect(kindOf({ kind: 'enum', name: 'OrderStatus' })).toBe('enum');
  });
});
