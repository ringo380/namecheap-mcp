# Installation & Setup

## Prerequisites

- **Node.js 18+**
- A [Namecheap account](https://www.namecheap.com) with API access enabled
- Your Namecheap API key (Account → Profile → Tools → API Access)
- Your public IP address [whitelisted](https://ap.www.namecheap.com/settings/tools/apiaccess/) in the Namecheap dashboard

> **Namecheap API access requirement:** API access is available to accounts with either $50+ in their account balance or 20+ domains registered. If you don't meet this threshold, use the sandbox for testing.

---

## Step 1: Enable API Access in Namecheap

1. Log in at [namecheap.com](https://www.namecheap.com)
2. Go to **Account → Profile → Tools → Namecheap API Access**
3. Enable API access and note your API key
4. Add your public IP to the whitelist (or the IP of the machine running the MCP server)

To find your public IP:
```bash
curl -s https://api.ipify.org
```

---

## Step 2: Add the MCP Server

### Option A: npx (no install required, always latest)

Add to your MCP config (e.g. `~/.claude.json` for Claude Code):

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

### Option B: Global install

```bash
npm install -g namecheap-mcp
```

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "namecheap-mcp"
    }
  }
}
```

### Option C: Local clone (for development)

```bash
git clone https://github.com/ringo380/namecheap-mcp
cd namecheap-mcp
npm install
npm run build
npm install -g .
```

---

## Step 3: Configure Credentials

Credentials are stored at `~/.config/namecheap-mcp/.env` (mode `0600`) and shared across all projects on the machine.

### Option 1: In-editor form — Claude Code ≥ 2.1.76 (recommended)

After adding the server config and restarting Claude Code, call the `setup` tool in the chat. An interactive form will appear asking for:

- API User (your Namecheap username)
- API Key
- Client IP (auto-detected from your current IP)
- Username (usually the same as API User)
- Sandbox mode (yes/no)

> Submit the form promptly — it will time out if left idle. If it times out, call `setup` again.

### Option 2: Interactive CLI

```bash
namecheap-mcp-setup
```

Walks through each field interactively with API key input suppressed.

### Option 3: Environment variables

Set these in your shell or in the `env` block of your MCP server config:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "namecheap-mcp",
      "env": {
        "NAMECHEAP_API_USER": "your_username",
        "NAMECHEAP_API_KEY": "your_api_key",
        "NAMECHEAP_CLIENT_IP": "1.2.3.4"
      }
    }
  }
}
```

**All variables:**

| Variable | Required | Description |
|---|---|---|
| `NAMECHEAP_API_USER` | Yes | Your Namecheap username |
| `NAMECHEAP_API_KEY` | Yes | API key from the dashboard |
| `NAMECHEAP_CLIENT_IP` | Yes | Whitelisted public IP |
| `NAMECHEAP_USERNAME` | No | Account username if different from API user |
| `NAMECHEAP_SANDBOX` | No | `true` to use `api.sandbox.namecheap.com` |

**Load order:** `process.env` → `~/.config/namecheap-mcp/.env` → `./.env` (earlier wins)

---

## Step 4: Verify

Restart your MCP client (e.g. `/mcp` in Claude Code). Then ask your AI assistant:

> "Check if example.com is available"

or

> "List my Namecheap domains"

If you get an error about IP whitelisting (`Error 1011102`), your `NAMECHEAP_CLIENT_IP` doesn't match the IP Namecheap sees. Re-check with `curl -s https://api.ipify.org`.

---

## Sandbox Testing

Namecheap provides a free sandbox at `api.sandbox.namecheap.com`. To use it:

1. Create a separate account at [sandbox.namecheap.com](https://www.sandbox.namecheap.com)
2. Enable API access and whitelist your IP in the sandbox dashboard
3. Set `NAMECHEAP_SANDBOX=true` in your config

Sandbox credentials are separate from production — you'll need a distinct API key.

---

## Updating

```bash
# If using npx: nothing to do, always pulls latest
# If using global install:
npm install -g namecheap-mcp
```

In Claude Code, run `/mcp` to reconnect after updating.
