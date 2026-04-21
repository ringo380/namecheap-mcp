#!/usr/bin/env node
// Silence stdout before any imports — MCP uses stdout exclusively for JSON-RPC
/* eslint-disable no-console */
console.log = () => { };
console.warn = () => { };
console.info = () => { };
console.debug = () => { };
console.trace = () => { };
/* eslint-enable no-console */
import { loadConfig, readConfig, validateClient, getCredentialSources } from './config.js';
loadConfig();
if (!readConfig()) {
    process.stderr.write('[namecheap-mcp] UNCONFIGURED at startup. sources: ' +
        JSON.stringify(getCredentialSources()) +
        '\n');
}
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NamecheapClient } from './client.js';
import { setAuthState } from './state.js';
import { VERSION } from './version.js';
import { registerSetupTool } from './tools/setup.js';
import { registerAuthStatusTool } from './tools/auth_status.js';
import { registerDomainTools } from './tools/domains.js';
import { registerDnsTools } from './tools/dns.js';
import { registerSslTools } from './tools/ssl.js';
import { registerAccountTools } from './tools/account.js';
import { registerTransferTools } from './tools/transfers.js';
const config = readConfig();
let clientRef = config ? new NamecheapClient(config) : null;
const getClient = () => clientRef;
const setClient = (c) => { clientRef = c; };
const UNCONFIGURED_INSTRUCTIONS = 'namecheap-mcp is not yet authenticated. Call the `setup` tool to enter your ' +
    'Namecheap API credentials, or `auth_status` to see what is wrong. The full ' +
    'tool suite (domains, DNS, SSL, etc.) appears once credentials validate.';
const READY_INSTRUCTIONS = 'namecheap-mcp is authenticated. Manage domains, DNS records, SSL certificates, ' +
    'transfers, and account billing via the exposed tools. Call `auth_status` to ' +
    'verify credentials or `setup` to reconfigure.';
const server = new McpServer({ name: 'namecheap-mcp', version: VERSION }, { instructions: clientRef ? READY_INSTRUCTIONS : UNCONFIGURED_INSTRUCTIONS });
// Always register the auth-related tools so the user has a path out of any state.
let readyToolsRegistered = false;
function registerReadyTools() {
    if (readyToolsRegistered)
        return;
    readyToolsRegistered = true;
    registerDomainTools(server, getClient);
    registerDnsTools(server, getClient);
    registerSslTools(server, getClient);
    registerAccountTools(server, getClient);
    registerTransferTools(server, getClient);
}
registerSetupTool(server, getClient, setClient, registerReadyTools);
registerAuthStatusTool(server, getClient);
// If credentials were loaded from env/config file, validate them up front so
// the tool list reflects reality. Unconfigured startups skip straight to stdio
// with only setup + auth_status visible.
if (clientRef) {
    const result = await validateClient(clientRef);
    if (result.ok) {
        setAuthState({ ok: true, validatedAt: Date.now() });
        registerReadyTools();
    }
    else {
        setAuthState({ ok: false, code: result.code, message: result.message, checkedAt: Date.now() });
        clientRef = null; // force tool handlers to surface UNCONFIGURED_MSG
    }
}
else {
    setAuthState({
        ok: false,
        code: 'UNCONFIGURED',
        message: 'No credentials found in environment or ~/.config/namecheap-mcp/.env',
        checkedAt: Date.now(),
    });
}
// Cheap insurance against orphan stdio processes (issue #4). StdioServerTransport
// should close on stdin EOF, but explicit handlers guarantee no accumulating zombies.
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => process.exit(0));
}
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map