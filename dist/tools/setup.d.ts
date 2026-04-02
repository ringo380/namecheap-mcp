import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NamecheapClient } from '../client.js';
export declare function registerSetupTool(server: McpServer, getClient: () => NamecheapClient | null, setClient: (c: NamecheapClient) => void): void;
