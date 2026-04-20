# Changelog

## [1.3.2] — 2026-04-20

### Fixed
- **Shell env no longer silently shadows `.env` file values** (#4). `loadConfig()` previously relied on `dotenv.config()`, which never overrides existing `process.env` keys and treats empty strings as "already set." A shell that exported `NAMECHEAP_API_KEY=""` (or just one of the three required vars) would leave file values unloaded while `auth_status` reported `user-config` as the source — producing `ready:false` with an empty effective value. `loadConfig()` now does an explicit per-key merge that treats empty strings as unset. Precedence is unchanged: non-empty shell/host env > user-config file > project-local `.env`.
- **Orphan MCP processes no longer survive stdin close** (#4). `src/index.ts` now installs explicit `stdin` `end`/`close` and `SIGTERM`/`SIGINT`/`SIGHUP` handlers that `process.exit(0)`. `StdioServerTransport` should close on EOF on its own, but the explicit handlers guarantee dead processes cannot accumulate across Claude Code reconnects.

### Added
- Loud stderr warning on startup when credentials are missing: `[namecheap-mcp] UNCONFIGURED at startup. sources: {...}`. Surfaces the failure immediately instead of waiting for the first tool call.

## [1.3.1] — 2026-04-20

### Added
- `auth_status` now reports the **source of each credential** (`shell`, `user-config`, `project-env`, or `missing`) and a `splitSources` boolean — exposing the footgun where a stale shell-exported `NAMECHEAP_API_KEY` silently shadows the correct value in `~/.config/namecheap-mcp/.env`. Validation failures that stem from split sources produce a specific hint naming the remediation (unset the shell export or make all three required vars come from the same source).

### Notes
- This is a diagnostic-only change. No precedence behavior changed: shell/host env still wins over file (dotenv default). The fix replaces a mystery with a visible explanation.

## [1.3.0] — 2026-04-20

### Added
- `auth_status` tool — reports whether credentials are loaded, whether they were accepted by the Namecheap API, and the last error if any. Returns `structuredContent` with `errorCode`, actionable `hint`, and `recommendedAction`. Use this to diagnose why tools are failing.
- Startup credential validation — on boot, if credentials are present the server pings `namecheap.users.getBalances` once. If the ping fails (bad key, unwhitelisted IP, etc.) the server records the failure and starts in an unconfigured state instead of silently exposing broken tools.
- Dynamic `serverInfo.instructions` — the MCP client sees a different description depending on auth state, pointing unconfigured users directly at `setup`.

### Changed
- **Tool-list gating**: when the server is unconfigured or credentials are invalid, the `/mcp` dialog now shows only two tools (`setup`, `auth_status`) instead of all 32. Once credentials validate, the full tool suite registers and the client receives a `notifications/tools/list_changed` so it refreshes without a reconnect.
- **Structured error payloads**: all tool catch blocks now return `isError: true` with a `structuredContent` body containing `errorCode`, `command`, `isAuthError`, and `isUnconfigured`. Error messages include the Namecheap error code inline (e.g. `Error [1011102]: ...`) and auth-class failures update `auth_status` in place.
- `setup` tool now records auth state and fires `sendToolListChanged()` on success so the full tool list appears immediately.

### Notes
- The MCP protocol's native `/mcp` **Authenticate** button is HTTP/OAuth-transport only (per MCP 2025-06-18). Because namecheap-mcp uses stdio, the supported auth flow is the `setup` tool (elicitation form) or the `/namecheap-mcp:setup` slash command. This release makes that flow much more discoverable.

## [1.2.1] — 2026-04-20

### Added
- Claude Code plugin bundling: `.claude-plugin/plugin.json`, `.mcp.json`, `/namecheap-mcp:setup` slash command, and a launcher script that prefers a global `namecheap-mcp` binary and falls back to the bundled `dist/index.js`. Installable via the `robworks-claude-code-plugins` marketplace.

### Fixed
- Resolved 11 moderate Dependabot advisories by bumping transitive dependencies: `axios` → 1.15.1 (SSRF via NO_PROXY normalization, cloud metadata exfiltration), `follow-redirects` → 1.16.0 (auth header leak on cross-domain redirects), `hono` → 4.12.14 (cookie validation, path traversal, JSX HTML injection, middleware bypass, IP matching), `@hono/node-server` → 1.19.13 (middleware bypass).

## [1.2.0] — 2026-04-03

### Added
- `register_domain` — purchase a new domain with registrant contact info
- `get_domain_contacts` — read WHOIS contact info for a domain
- `set_domain_contacts` — update registrant/tech/admin/billing contacts
- `reactivate_domain` — recover a recently expired domain
- `renew_whoisguard` — renew WHOIS privacy protection independently of domain renewal
- `transfer_domain` — initiate an inbound transfer with EPP code
- `get_transfer_status` — check transfer status by ID
- `list_transfers` — list all transfers, filterable by status
- `get_ssl_info` — get details for a specific SSL certificate
- `activate_ssl` — activate a purchased certificate by submitting a CSR; supports email, HTTP file, and CNAME DCV methods
- `reissue_ssl` — reissue a certificate with a new CSR

### Fixed
- Upgraded `fast-xml-parser` from `^4.4.0` to `^5.5.7` to address a moderate security vulnerability

## [1.1.0] — 2026-03-xx

### Added
- `update_dns_record` — safe single-record add/update/delete (read-modify-write) without affecting other records
- `set_domain_autorenew` — enable or disable auto-renewal
- `set_registrar_lock` — lock or unlock domain transfer
- `set_whoisguard` — enable or disable WHOIS privacy
- `get_pricing` — query pricing for domains, SSL, or Whois Guard
- `get_tld_list` — browse supported TLDs with `search` and `registerable` filters

### Changed
- Cleaned up all tool outputs — structured JSON instead of raw API responses
- `get_domain_info` now returns a flattened, human-readable object

## [1.0.0] — Initial release

- `setup` — interactive credential configuration (MCP elicitation or standalone CLI)
- `check_domains` — availability check for one or more domains
- `list_domains` — paginated domain list with status filtering
- `get_domain_info` — full domain details
- `renew_domain` — renew a domain for 1–10 years
- `get_dns_hosts` — read all DNS records
- `set_dns_hosts` — replace all DNS records
- `set_dns_default` — revert to Namecheap nameservers
- `set_dns_custom` — set custom nameservers
- `get_email_forwarding` / `set_email_forwarding` — email forwarding rules
- `list_ssl_certs` / `create_ssl_cert` — SSL certificate management
- `get_balances` — account balance
