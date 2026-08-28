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
});
