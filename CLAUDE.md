# namecheap-mcp

MCP server wrapping the Namecheap XML API. TypeScript, stdio transport.

## Commands
- `npm run build` — compile + chmod +x dist/index.js dist/setup.js
- `npm run dev` — tsx watch (no build needed)
- `npm run type-check` — tsc --noEmit

## Architecture
- `src/client.ts` — NamecheapClient: XML HTTP + auth + error handling
- `src/config.ts` — loadConfig() / readConfig() / USER_CONFIG_PATH constants
- `src/tools/` — setup, domains, dns, ssl, account (registerTool per file)
- `src/index.ts` — entry point, nullable client, server wiring
- `src/setup.ts` — standalone interactive CLI binary (namecheap-mcp-setup)

## Setup / Configuration
- Run `namecheap-mcp-setup` in terminal for interactive setup (prompts for all fields, echoes API key suppressed)
- Or call the `setup` MCP tool from within Claude Code (uses elicitation, requires Claude Code ≥ 2.1.76)
- Credentials stored at `~/.config/namecheap-mcp/.env` (mode 0600)
- Config load order: process.env → `~/.config/namecheap-mcp/.env` → `./.env` (earlier wins)
- Server starts without credentials; tools return UNCONFIGURED_MSG until setup runs

## Namecheap API
- XML HTTP at `https://api.namecheap.com/xml.response` (GET for most, POST for setHosts)
- Auth params on every request: ApiUser, ApiKey, UserName, ClientIp, Command
- DNS tools (getHosts/setHosts/setDefault/setCustom) require SLD + TLD separately, not full domain
- Email forwarding (getEmailForwarding/setEmailForwarding) uses DomainName (full domain), not SLD+TLD
- fast-xml-parser: `parseAttributeValue: false` — preserve string fidelity for DNS record values
- fast-xml-parser: tags that appear 0-N times must be in ARRAY_TAGS in client.ts (else last value wins)
- Error 1011102 = IP not whitelisted (NAMECHEAP_CLIENT_IP must match Namecheap dashboard)

## Required env vars
- `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`, `NAMECHEAP_CLIENT_IP`
- `NAMECHEAP_SANDBOX=true` for sandbox API
