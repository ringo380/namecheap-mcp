import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NamecheapClient } from '../client.js';
export declare function registerAuthStatusTool(server: McpServer, getClient: () => NamecheapClient | null): void;
