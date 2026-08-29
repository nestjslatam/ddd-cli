import { ArtifactGeneratorService } from './artifact-generator.service';
import { orderSpec } from '../../test/fixtures/order-spec';

describe('ArtifactGeneratorService', () => {
  const generator = new ArtifactGeneratorService();

  it('emits every artifact the aggregate needs', () => {
    const paths = generator.generate(orderSpec).map((a) => a.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        'order/domain/order-aggregate/order.ts',
        'order/domain/order-aggregate/validators/order-invariants.validator.ts',
        'order/domain/order-aggregate/events/order-placed-event.ts',
        'order/application/use-cases/place-order/place-order.command.ts',
        'order/application/use-cases/place-order/place-order.command-handler.ts',
        'order/infrastructure/repositories/order.repository.ts',
        'order/order.module.ts',
        'shared/valueobjects/customer-name.ts',
        'shared/valueobjects/order-total.ts',
      ]),
    );
  });

  it('is deterministic: the same spec yields byte-identical output', () => {
    expect(generator.generate(orderSpec)).toEqual(
      generator.generate(orderSpec),
    );
  });

  it('registers command handlers as providers so NestJS can discover them', () => {
    const module = generator
      .generate(orderSpec)
      .find((a) => a.path === 'order/order.module.ts')!;

    // A handler that is not a provider is never instantiated, and the command
    // silently goes unhandled at runtime.
    expect(module.contents).toContain('PlaceOrderCommandHandler');
    expect(module.contents).toContain('imports: [CqrsModule]');
    expect(module.contents).toContain('...commandHandlers');
  });

  it('commits through the publisher context so events actually dispatch', () => {
    const handler = generator
      .generate(orderSpec)
      .find((a) => a.path.endsWith('place-order.command-handler.ts'))!;

    expect(handler.contents).toContain('mergeObjectContext');
    expect(handler.contents).toContain('.commit()');
  });

  it('wraps value-object primitives when constructing the aggregate', () => {
    const handler = generator
      .generate(orderSpec)
      .find((a) => a.path.endsWith('place-order.command-handler.ts'))!;

    expect(handler.contents).toContain('CustomerName.create(customerName)');
    expect(handler.contents).toContain('OrderTotal.create(total)');
  });

  it('renders invariant conditions verbatim into the validator', () => {
    const validator = generator
      .generate(orderSpec)
      .find((a) => a.path.endsWith('order-invariants.validator.ts'))!;

    expect(validator.contents).toContain('props.total.getValue() > 1000000');
    expect(validator.contents).toContain(
      "'Order total exceeds the maximum allowed'",
    );
  });

  it('reads isValid on the aggregate, matching the unified contract', () => {
    // ddd-lib 3.0.0 unified both bases on a getter. Before that the aggregate
    // declared a method, and emitting the property form here produced a guard
    // that could never fire.
    const aggregate = generator
      .generate(orderSpec)
      .find((a) => a.path === 'order/domain/order-aggregate/order.ts')!;

    expect(aggregate.contents).toContain('if (!order.isValid)');
  });

  it('reads isValid the same way on value objects', () => {
    const valueObject = generator
      .generate(orderSpec)
      .find((a) => a.path === 'shared/valueobjects/order-total.ts')!;

    expect(valueObject.contents).toContain('if (!instance.isValid)');
    expect(valueObject.contents).not.toContain('instance.isValid()');
  });

  it('binds the id a mutating handler looks the aggregate up by', () => {
    // The mutate template hardcoded `findById(id)` while only the command's
    // own properties are destructured, so every non-create handler referenced
    // an unbound identifier and failed to compile. The original fixture only
    // exercised returns: 'string', which took the create path and hid it.
    const handler = new ArtifactGeneratorService()
      .generate({
        ...orderSpec,
        commands: [
          {
            name: 'CancelOrderCommand',
            description: 'Cancels an order.',
            properties: [
              { name: 'orderId', type: 'string' },
              { name: 'reason', type: 'string' },
            ],
            returns: 'void',
            raises: [],
          },
        ],
      })
      .find((a) => a.path.endsWith('cancel-order.command-handler.ts'))!;

    expect(handler.contents).toContain('findById(orderId)');
    expect(handler.contents).not.toMatch(/findById\(id\)/);
  });

  it('refuses to guess an id when the command carries none', () => {
    const handler = new ArtifactGeneratorService()
      .generate({
        ...orderSpec,
        commands: [
          {
            name: 'ArchiveAllCommand',
            description: 'Archives everything.',
            properties: [],
            returns: 'void',
            raises: [],
          },
        ],
      })
      .find((a) => a.path.endsWith('archive-all.command-handler.ts'))!;

    expect(handler.contents).toContain('carries no aggregate id');
    expect(handler.contents).not.toContain('findById');
  });

  it('ends every file with exactly one trailing newline', () => {
    for (const item of generator.generate(orderSpec)) {
      expect(item.contents.endsWith('\n')).toBe(true);
      expect(item.contents.endsWith('\n\n')).toBe(false);
    }
  });
});
