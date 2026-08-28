import { Command, CommandRunner } from 'nest-commander';

import { McpServerService } from '../mcp/mcp-server.service';

@Command({
  name: 'mcp',
  description:
    'Run as an MCP server so an AI agent can use the CLI through its own model',
})
export class McpCommand extends CommandRunner {
  constructor(private readonly server: McpServerService) {
    super();
  }

  async run(): Promise<void> {
    // MCP speaks JSON-RPC over stdout. Nothing else may write there, which is
    // why this command produces no output of its own and main.ts silences the
    // Nest logger for it -- a single stray line corrupts the stream and the
    // client drops the connection.
    await this.server.serve();

    // connect() resolves once the transport is listening; the process must
    // stay alive to serve requests.
    await new Promise<never>(() => {});
  }
}
