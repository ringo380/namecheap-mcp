# Namecheap MCP Server

**Created**: 2026-04-02
**Status**: In Progress

## Context

Build a local stdio MCP server that wraps the Namecheap API, exposing 15 tools covering domains, DNS, SSL, and account management. The repo at `/Users/ryanrobson/git/namecheap-mcp` is currently empty (only auto-generated browser-pilot files). The Namecheap API is XML-based HTTP (GET/POST) with API key + IP whitelist auth.

## Overview

- **Deployment**: Local stdio (personal use)
- **Framework**: TypeScript + `@modelcontextprotocol/sdk`
- **Tool pattern**: One tool per action (~15 tools)
- **XML parsing**: `fast-xml-parser`
- **Auth**: API key + username + whitelisted IP via env vars
- **Sandbox support**: `NAMECHEAP_SANDBOX=true` env var

## File Structure

```
src/
  index.ts          - Entry point: reads env, wires McpServer, connects StdioTransport
  client.ts         - NamecheapClient: HTTP + XML parsing, error handling
  types.ts          - Shared interfaces: NamecheapConfig, HostRecord, EmailForward, NamecheapApiError
  tools/
    domains.ts      - 5 tools: check_domains, list_domains, get_domain_info, renew_domain, get_tld_list
    dns.ts          - 6 tools: get_dns_hosts, set_dns_hosts, get_email_forwarding, set_email_forwarding, set_dns_default, set_dns_custom
    ssl.ts          - 2 tools: list_ssl_certs, create_ssl_cert
    account.ts      - 2 tools: get_balances, get_pricing
.env.example
package.json
tsconfig.json
.gitignore
```

## Tasks

- [ ] Create `package.json` with dependencies
- [ ] Create `tsconfig.json`
- [ ] Create `.gitignore` and `.env.example`
- [ ] Implement `src/types.ts`
- [ ] Implement `src/client.ts`
- [ ] Implement `src/tools/domains.ts`
- [ ] Implement `src/tools/dns.ts`
- [ ] Implement `src/tools/ssl.ts`
- [ ] Implement `src/tools/account.ts`
- [ ] Implement `src/index.ts`
- [ ] Run `npm install` and `npm run build`
- [ ] Verify with `npm run type-check`

## Key Implementation Details

### package.json dependencies
```json
{
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.3",
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "fast-xml-parser": "^4.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0"
  }
}
```

### tsconfig.json
- `"module": "ES2022"`, `"moduleResolution": "bundler"`, `"target": "ES2022"`, strict mode

### Environment Variables
| Variable | Required | Description |
|---|---|---|
| `NAMECHEAP_API_USER` | Yes | Namecheap username (used as ApiUser) |
| `NAMECHEAP_API_KEY` | Yes | API key from Dashboard → Profile → Tools → API Access |
| `NAMECHEAP_CLIENT_IP` | Yes | Whitelisted public IP |
| `NAMECHEAP_USERNAME` | No | Falls back to `NAMECHEAP_API_USER` |
| `NAMECHEAP_SANDBOX` | No | Set `"true"` to use `api.sandbox.namecheap.com` |

### NamecheapClient (`src/client.ts`)
- `execute(command, params, method?: 'GET'|'POST')` — builds auth params + command params, makes HTTP request, parses XML
- `fast-xml-parser` config: `ignoreAttributes: false`, `attributeNamePrefix: "@_"`, `isArray` callback for: `DomainCheckResult`, `Domain`, `Host`, `EmailForward`, `SSL`
- Check `ApiResponse["@_Status"]`: if `"ERROR"` throw `NamecheapApiError` with code and message; if `"OK"` return `CommandResponse`
- SLD/TLD split helper: split `"example.com"` → `SLD=example`, `TLD=com` for DNS tools
- `flattenHostRecords()` helper for `set_dns_hosts` POST indexed params (`HostName1`, `RecordType1`, etc.)

### Critical pitfalls
1. **Stdout silence**: `console.log = () => {}` before any imports — MCP uses stdout for JSON-RPC
2. **`set_dns_hosts` is destructive** — replaces all records; tool description must warn Claude
3. **SLD/TLD split** — DNS endpoints require separate SLD and TLD params, not full domain name
4. **single-element arrays** — `fast-xml-parser` `isArray` callback must cover all collection tags

### Tool registration pattern (tools files)
```typescript
export function registerDomainTools(server: McpServer, client: NamecheapClient) {
  server.tool('check_domains', 'description', { domains: z.string() }, async ({ domains }) => {
    try {
      const result = await client.execute('namecheap.domains.check', { DomainList: domains });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });
}
```

## Files to Modify / Create

- `package.json` — create
- `tsconfig.json` — create
- `.gitignore` — create
- `.env.example` — create
- `src/types.ts` — create
- `src/client.ts` — create
- `src/tools/domains.ts` — create
- `src/tools/dns.ts` — create
- `src/tools/ssl.ts` — create
- `src/tools/account.ts` — create
- `src/index.ts` — create

## Verification

1. `npm install` — no errors
2. `npm run build` / `npm run type-check` — zero TypeScript errors
3. Test with sandbox: set `NAMECHEAP_SANDBOX=true`, run `node dist/index.js` — server starts without errors on stderr
4. Add to Claude Code via `claude mcp add` and verify tools appear: `claude mcp list`
5. Test `check_domains` with a known domain in sandbox environment

## Claude Code Config (after build)

```json
{
  "mcpServers": {
    "namecheap": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/ryanrobson/git/namecheap-mcp/dist/index.js"],
      "env": {
        "NAMECHEAP_API_USER": "yourUsername",
        "NAMECHEAP_API_KEY": "yourApiKeyHere",
        "NAMECHEAP_CLIENT_IP": "1.2.3.4",
        "NAMECHEAP_SANDBOX": "false"
      }
    }
  }
}
```
