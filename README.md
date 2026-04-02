# namecheap-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that wraps the [Namecheap API](https://www.namecheap.com/support/api/intro/), giving AI assistants the ability to manage domains, DNS records, SSL certificates, and account information directly from your conversations.

## Features

- **Domains** — check availability, list your domains, view domain info, renew
- **DNS** — read and write host records (A, AAAA, CNAME, MX, TXT, NS), set custom or default nameservers
- **Email Forwarding** — get and set per-domain forwarding rules
- **SSL** — list certificates, purchase new ones
- **Account** — check balances, query pricing
- **TLD Browser** — search available TLDs with filtering by name or registerability
- **Interactive Setup** — configure credentials via an in-editor form or a standalone CLI tool

## Requirements

- Node.js 18+
- A [Namecheap account](https://www.namecheap.com) with API access enabled
- Your public IP [whitelisted](https://ap.www.namecheap.com/settings/tools/apiaccess/) in the Namecheap dashboard

## Installation

### Via npx (no install needed)

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "npx",
      "args": ["-y", "namecheap-mcp"]
    }
  }
}
```

### Global install

```bash
npm install -g namecheap-mcp
```

Then configure:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "namecheap-mcp"
    }
  }
}
```

## Setup

Credentials are stored globally at `~/.config/namecheap-mcp/.env` and are picked up automatically by any project using this server — you only need to configure once per machine.

### Option 1: In-editor form (Claude Code ≥ 2.1.76)

Call the `setup` tool from within Claude Code. A form will appear prompting for your credentials. Your public IP is auto-detected as a default.

> **Tip:** Submit the form promptly — the request will time out if left idle. If it times out, just call `setup` again.

### Option 2: Interactive CLI

```bash
namecheap-mcp-setup
```

Walks you through each field with your API key input suppressed, then writes the config file.

### Option 3: Environment variables

Set these in your shell or MCP server config's `env` block:

| Variable | Description |
|---|---|
| `NAMECHEAP_API_USER` | Your Namecheap username |
| `NAMECHEAP_API_KEY` | API key (Account → Profile → Tools → API Access) |
| `NAMECHEAP_CLIENT_IP` | Whitelisted public IP address |
| `NAMECHEAP_USERNAME` | Account username if different from API user (optional) |
| `NAMECHEAP_SANDBOX` | `true` to use the sandbox API (optional) |

Environment variables take precedence over the config file, which takes precedence over a local `.env` in the working directory.

## Tools

### Domains

| Tool | Description |
|---|---|
| `setup` | Configure credentials interactively |
| `check_domains` | Check availability of one or more domains |
| `list_domains` | List all domains in your account (paginated, filterable) |
| `get_domain_info` | Full details for a single domain |
| `renew_domain` | Renew a domain for 1–10 years |
| `get_tld_list` | Browse supported TLDs; filter by name or registerability |

### DNS

| Tool | Description |
|---|---|
| `get_dns_hosts` | Read all DNS records for a domain |
| `set_dns_hosts` | Replace all DNS records for a domain |
| `set_dns_default` | Revert to Namecheap's default nameservers |
| `set_dns_custom` | Delegate DNS to external nameservers (e.g. Cloudflare) |
| `get_email_forwarding` | Read email forwarding rules |
| `set_email_forwarding` | Replace email forwarding rules |

> **Note:** `set_dns_hosts` and `set_email_forwarding` are destructive — they replace all existing records. Call the corresponding `get_` tool first if you need to preserve existing entries.

### SSL

| Tool | Description |
|---|---|
| `list_ssl_certs` | List SSL certificates in your account |
| `create_ssl_cert` | Purchase a new SSL certificate |

### Account

| Tool | Description |
|---|---|
| `get_balances` | Account balance and withdrawable amount |
| `get_pricing` | Pricing for domains, SSL, or Whois Guard |

## API Notes

- DNS tools (`get_dns_hosts`, `set_dns_hosts`, etc.) accept a full domain name like `example.com` — SLD/TLD splitting is handled internally
- Email forwarding tools use the full domain name, not SLD+TLD
- Error `1011102` means your `NAMECHEAP_CLIENT_IP` is not whitelisted in the Namecheap dashboard
- Set `NAMECHEAP_SANDBOX=true` to use `api.sandbox.namecheap.com` for testing

## Development

```bash
git clone https://github.com/ringo380/namecheap-mcp
cd namecheap-mcp
npm install
npm run dev        # tsx watch — no build needed
npm run build      # compile TypeScript
npm run type-check # type-check without emitting
```

After making changes, run `npm run build && npm install -g .` to update the global install.

## License

MIT
