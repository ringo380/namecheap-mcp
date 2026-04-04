#!/usr/bin/env node

// Silence stdout before any imports — MCP uses stdout exclusively for JSON-RPC
/* eslint-disable no-console */
console.log = () => {};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};
console.trace = () => {};
/* eslint-enable no-console */

import { loadConfig, readConfig } from './config.js';
loadConfig();

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NamecheapClient } from './client.js';
import { registerSetupTool } from './tools/setup.js';
import { registerDomainTools } from './tools/domains.js';
import { registerDnsTools } from './tools/dns.js';
import { registerSslTools } from './tools/ssl.js';
import { registerAccountTools } from './tools/account.js';
import { registerTransferTools } from './tools/transfers.js';

const config = readConfig();
let clientRef: NamecheapClient | null = config ? new NamecheapClient(config) : null;
const getClient = () => clientRef;
const setClient = (c: NamecheapClient) => { clientRef = c; };

const server = new McpServer({ name: 'namecheap-mcp', version: '1.0.0' });

registerSetupTool(server, getClient, setClient);
registerDomainTools(server, getClient);
registerDnsTools(server, getClient);
registerSslTools(server, getClient);
registerAccountTools(server, getClient);
registerTransferTools(server, getClient);

const transport = new StdioServerTransport();
await server.connect(transport);
