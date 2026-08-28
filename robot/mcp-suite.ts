import { ChildProcess, spawn } from 'node:child_process';

import { Result } from './types';

interface ToolCheck {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  /** Returns null when the response is acceptable, else why it is not. */
  verify: (body: any) => string | null;
}

const CHECKS: ToolCheck[] = [
  {
    name: 'ddd_list filters by role',
    tool: 'ddd_list',
    args: { role: 'compose' },
    verify: (body) =>
      Array.isArray(body) && body.every((s: any) => s.role === 'compose')
        ? null
        : 'expected every entry to have role compose',
  },
  {
    name: 'ddd_describe returns the contract',
    tool: 'ddd_describe',
    args: { symbol: 'AbstractRuleValidator' },
    verify: (body) =>
      body?.mustImplement?.some((m: any) => m.name === 'addRules')
        ? null
        : 'expected addRules in mustImplement',
  },
  {
    name: 'ddd_describe suggests a near miss',
    tool: 'ddd_describe',
    args: { symbol: 'BrokenRuleManager' },
    verify: (body) =>
      body?.didYouMean?.includes('BrokenRulesManager')
        ? null
        : 'expected BrokenRulesManager among suggestions',
  },
  {
    name: 'ddd_new returns files without writing',
    tool: 'ddd_new',
    args: {
      stereotype: 'value-object',
      name: 'OrderTotal',
      primitive: 'number',
    },
    verify: (body) =>
      body?.written === false && body?.files?.[0]?.contents?.includes('isValid')
        ? null
        : 'expected written=false and a factory that checks isValid',
  },
  {
    name: 'ddd_new rejects a bad class name',
    tool: 'ddd_new',
    args: { stereotype: 'value-object', name: 'orderTotal' },
    verify: (body) =>
      typeof body?.error === 'string' && body.error.includes('PascalCase')
        ? null
        : 'expected a PascalCase complaint',
  },
  {
    name: 'ddd_extend explains why a collaborator is not a base',
    tool: 'ddd_extend',
    args: { base: 'BrokenRulesManager', name: 'X' },
    verify: (body) =>
      body?.error?.includes('collaborator')
        ? null
        : 'expected the collaborator explanation',
  },
  {
    name: 'ddd_aggregate_schema returns the contract and the rules',
    tool: 'ddd_aggregate_schema',
    args: {},
    verify: (body) =>
      body?.schema &&
      Array.isArray(body?.modellingRules) &&
      body.modellingRules.length
        ? null
        : 'expected a schema and modelling rules',
  },
  {
    name: 'ddd_render_aggregate reports why a bad spec failed',
    tool: 'ddd_render_aggregate',
    // An agent produced this; telling it exactly what is wrong lets it
    // correct itself without a human in the loop.
    args: { spec: { name: 'nope', properties: [] } },
    verify: (body) =>
      Array.isArray(body?.issues) && body.issues.length
        ? null
        : 'expected per-field validation issues',
  },
  {
    name: 'ddd_render_aggregate renders a valid spec',
    tool: 'ddd_render_aggregate',
    args: {
      spec: {
        name: 'Order',
        description: 'A customer order.',
        properties: [{ name: 'total', type: 'OrderTotal', description: '' }],
        valueObjects: [
          {
            name: 'OrderTotal',
            kind: 'number',
            description: 'Amount payable.',
            rules: [
              {
                property: 'value',
                condition: 'value <= 0',
                message: 'Order total must be positive',
              },
            ],
          },
        ],
        events: [],
        commands: [],
        invariants: [],
      },
    },
    verify: (body) =>
      body?.written === false &&
      body?.files?.some((f: any) => f.path.endsWith('order/order.module.ts'))
        ? null
        : 'expected the module among the rendered files',
  },
  {
    name: 'ddd_validate reports findings',
    tool: 'ddd_validate',
    args: {},
    verify: (body) =>
      typeof body?.errors === 'number' && typeof body?.warnings === 'number'
        ? null
        : 'expected an error and warning count',
  },
];

/**
 * Drives the MCP server over stdio, the way an agent would.
 *
 * Also asserts nothing outside the protocol reaches stdout: MCP is JSON-RPC on
 * that stream, and one stray log line makes a client drop the connection.
 */
export async function runMcpSuite(cli: string, cwd: string): Promise<Result[]> {
  const child: ChildProcess = spawn(process.execPath, [cli, 'mcp'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  });

  const responses = new Map<number, any>();
  const strayOutput: string[] = [];
  let buffer = '';

  child.stdout?.on('data', (chunk) => {
    buffer += chunk.toString();
    let index: number;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (message.id) responses.set(message.id, message);
      } catch {
        strayOutput.push(line);
      }
    }
  });

  const send = (payload: unknown): void => {
    child.stdin?.write(`${JSON.stringify(payload)}\n`);
  };

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'robot', version: '1' },
    },
  });
  await wait(800);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const results: Result[] = [];
  const record = (
    scenario: string,
    reason: string | null,
    startedAt: number,
  ): void => {
    results.push({
      suite: 'mcp',
      scenario,
      outcome: reason ? 'fail' : 'pass',
      reason: reason ?? undefined,
      durationMs: Date.now() - startedAt,
    });
  };

  const handshakeStart = Date.now();
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await wait(600);

  const listed = responses.get(2)?.result?.tools ?? [];
  record(
    'handshake and tool listing',
    responses.get(1)?.result?.serverInfo?.name && listed.length >= 7
      ? null
      : `expected a serverInfo and at least 7 tools, saw ${listed.length}`,
    handshakeStart,
  );

  let id = 100;
  for (const check of CHECKS) {
    const startedAt = Date.now();
    const callId = id++;
    send({
      jsonrpc: '2.0',
      id: callId,
      method: 'tools/call',
      params: { name: check.tool, arguments: check.args },
    });
    await wait(500);

    const response = responses.get(callId);
    if (!response) {
      record(check.name, 'no response from the server', startedAt);
      continue;
    }

    let body: unknown;
    try {
      body = JSON.parse(response.result.content[0].text);
    } catch {
      record(check.name, 'response was not JSON', startedAt);
      continue;
    }

    record(check.name, check.verify(body), startedAt);
  }

  const strayStart = Date.now();
  record(
    'writes nothing outside the protocol on stdout',
    strayOutput.length
      ? `${strayOutput.length} stray line(s): ${strayOutput[0].slice(0, 80)}`
      : null,
    strayStart,
  );

  child.kill();
  return results;
}
