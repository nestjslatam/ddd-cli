import { AggregateSpec } from '../../src/generation/aggregate-spec.schema';

/**
 * A hand-written spec standing in for planner output, so the renderers can be
 * exercised without calling a model. Shaped like something a model would
 * plausibly return for "an order has a customer, a total and a status".
 */
export const orderSpec: AggregateSpec = {
  name: 'Order',
  slug: 'order',
  description: 'A customer order with a monetary total and a lifecycle status.',
  properties: [
    {
      name: 'customerName',
      type: 'CustomerName',
      description: 'Who placed it',
    },
    { name: 'total', type: 'OrderTotal', description: 'Amount payable' },
  ],
  valueObjects: [
    {
      name: 'CustomerName',
      kind: 'string',
      description: 'The name the order was placed under.',
      rules: [
        {
          property: 'value',
          condition: 'value.trim().length < 2',
          message: 'Customer name must be at least 2 characters',
        },
      ],
    },
    {
      name: 'OrderTotal',
      kind: 'number',
      description: 'The total amount payable for the order.',
      rules: [
        {
          property: 'value',
          condition: 'value <= 0',
          message: 'Order total must be greater than zero',
        },
      ],
    },
  ],
  events: [
    {
      name: 'OrderPlacedEvent',
      description: 'Raised once an order has been accepted.',
      properties: [
        { name: 'orderId', type: 'string' },
        { name: 'total', type: 'number' },
      ],
    },
  ],
  commands: [
    {
      name: 'PlaceOrderCommand',
      description: 'Places a new order.',
      properties: [
        { name: 'customerName', type: 'string' },
        { name: 'total', type: 'number' },
      ],
      returns: 'string',
      raises: ['OrderPlacedEvent'],
    },
  ],
  invariants: [
    {
      property: 'total',
      condition: 'props.total.getValue() > 1000000',
      message: 'Order total exceeds the maximum allowed',
    },
  ],
};
