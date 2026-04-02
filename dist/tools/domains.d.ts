import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NamecheapClient } from '../client.js';
export declare function registerDomainTools(server: McpServer, getClient: () => NamecheapClient | null): void;
