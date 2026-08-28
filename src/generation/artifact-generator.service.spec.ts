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

  it('ends every file with exactly one trailing newline', () => {
    for (const item of generator.generate(orderSpec)) {
      expect(item.contents.endsWith('\n')).toBe(true);
      expect(item.contents.endsWith('\n\n')).toBe(false);
    }
  });
});
