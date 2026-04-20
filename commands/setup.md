---
description: Guided first-run setup for the namecheap-mcp server — collect API credentials and write them to the global config.
allowed-tools: ["Bash", "Read", "Write"]
---

# /namecheap-mcp:setup

Walk the user through end-to-end setup so they can go from "plugin enabled" to "issuing Namecheap API calls from Claude Code" in one session.

> Note: Claude Code's native "Authenticate" button in the `/mcp` dialog only works for HTTP/OAuth-transport MCP servers (MCP 2025-06-18). namecheap-mcp is stdio, so this command and the `setup` tool are the supported auth flows. If the user sees only `setup` and `auth_status` exposed in `/mcp`, the server is not yet authenticated — run this command. The `auth_status` tool produces a full diagnostic at any time.

## Pre-flight

1. Confirm an existing config isn't already in place:
   ```bash
   test -f "$HOME/.config/namecheap-mcp/.env" && echo "EXISTS" || echo "MISSING"
   ```
   If `EXISTS`, ask the user whether to overwrite or keep the existing credentials before proceeding.

2. Namecheap requires the caller's public IP to be explicitly whitelisted in their dashboard. Get the current public IP so we can offer it as a default:
   ```bash
   curl -fsSL https://api.ipify.org || curl -fsSL https://ifconfig.me
   ```

## Credentials the user needs

Explain they will need three values from https://ap.www.namecheap.com/settings/tools/apiaccess/:

| Field | Where to find it |
| --- | --- |
| API username | Usually the same as the Namecheap account username |
| API key | Click "Enable API" (first time) or "Edit" → copy the key |
| Whitelisted IP | The public IP of whichever machine will call the API |

Remind them that API access is gated by account age / balance / recent purchase history — if they've never used it, Namecheap may ask them to meet one of those conditions first.

## Install credentials

Offer the user three setup styles and ask which they prefer:

### Option A — In-editor form (Claude Code ≥ 2.1.76)

Call the `setup` MCP tool. A form appears (public IP is auto-detected as a default). Submit promptly — the elicitation times out if left idle. If it times out, call `setup` again.

### Option B — Standalone CLI

If the user has `namecheap-mcp` installed globally:
```bash
namecheap-mcp-setup
```
Interactive prompts (API key echo is suppressed). Writes to `~/.config/namecheap-mcp/.env` with mode 0600.

### Option C — Manual env file

Offer to write the config file directly once they paste the values:
```bash
mkdir -p "$HOME/.config/namecheap-mcp"
cat > "$HOME/.config/namecheap-mcp/.env" <<'EOF'
NAMECHEAP_API_USER=<their-username>
NAMECHEAP_API_KEY=<their-api-key>
NAMECHEAP_CLIENT_IP=<their-whitelisted-ip>
# Optional:
# NAMECHEAP_USERNAME=<if-different-from-api-user>
# NAMECHEAP_SANDBOX=true
EOF
chmod 600 "$HOME/.config/namecheap-mcp/.env"
```

## Verify

Ask the user to reconnect the MCP server (`/mcp` → reconnect `namecheap-mcp`), then call a read-only tool to prove credentials work:

- `get_balances` — returns account balance
- `list_domains` — lists their portfolio

If either returns error `1011102`, the `NAMECHEAP_CLIENT_IP` in the config does not match what Namecheap sees. Re-check the whitelisted IP in the dashboard against the current public IP.

## Notes

- Config load order: `process.env` → `~/.config/namecheap-mcp/.env` → `./.env` (earlier wins). Env vars exported in the shell will override the config file.
- The plugin's bundled `dist/index.js` is launched via `hooks/scripts/launch-mcp.sh`, which prefers a globally installed `namecheap-mcp` binary if present. Users who previously ran `npm install -g .` will transparently use that one.
