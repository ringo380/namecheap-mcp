import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'node:fs';
import { NamecheapClient } from '../client.js';
import {
  USER_CONFIG_PATH,
  getCredentialSources,
  detectPublicIp,
  REQUIRED_CREDENTIAL_KEYS as REQUIRED_KEYS,
} from '../config.js';
import { getAuthState } from '../state.js';

export function registerAuthStatusTool(
  server: McpServer,
  getClient: () => NamecheapClient | null,
): void {
  server.registerTool(
    'auth_status',
    {
      description:
        'Report the current authentication status of namecheap-mcp: whether credentials ' +
        'are loaded, whether they were accepted by the Namecheap API, where each credential ' +
        'came from (shell env vs config file), and the last error if any. Call this when ' +
        'tools are failing to diagnose whether the problem is a missing config, an ' +
        'unwhitelisted IP, a stale shell export shadowing the config file, or an invalid API key.',
      inputSchema: {},
    },
    async () => {
      const state = getAuthState();
      const clientLoaded = getClient() !== null;
      const configFileExists = fs.existsSync(USER_CONFIG_PATH);
      const sources = getCredentialSources();
      const clientIp = process.env['NAMECHEAP_CLIENT_IP'] ?? null;
      // Detect the caller's current public IP so we can tell the user whether
      // their configured NAMECHEAP_CLIENT_IP still matches the outbound IP.
      // Namecheap error 1011102 is ambiguous (bad key OR unwhitelisted IP);
      // showing both values at once resolves it on the spot. 2s timeout so a
      // network blip never blocks the auth_status response.
      const currentPublicIp = await detectPublicIp();
      const ipMatchesConfigured =
        currentPublicIp !== null && clientIp !== null && currentPublicIp === clientIp;

      // Detect split-source footgun: required credentials coming from different
      // origins (e.g. API_KEY from shell, USER/CLIENT_IP from user-config) often
      // means a stale shell export is silently shadowing the file's correct value.
      const presentSources = new Set(
        REQUIRED_KEYS.map((k) => sources[k]).filter((s) => s !== 'missing'),
      );
      const splitSources = presentSources.size > 1;

      const payload: Record<string, unknown> = {
        ready: state.ok === true,
        clientInitialized: clientLoaded,
        configFilePath: USER_CONFIG_PATH,
        configFileExists,
        sources: {
          NAMECHEAP_API_USER: sources['NAMECHEAP_API_USER'],
          NAMECHEAP_API_KEY: sources['NAMECHEAP_API_KEY'],
          NAMECHEAP_CLIENT_IP: sources['NAMECHEAP_CLIENT_IP'],
          NAMECHEAP_USERNAME: sources['NAMECHEAP_USERNAME'],
          NAMECHEAP_SANDBOX: sources['NAMECHEAP_SANDBOX'],
        },
        effective: {
          NAMECHEAP_CLIENT_IP: clientIp,
          NAMECHEAP_SANDBOX: process.env['NAMECHEAP_SANDBOX'] === 'true',
        },
        currentPublicIp,
        ipMatchesConfigured,
        splitSources,
        lastCheck: new Date(state.ok ? state.validatedAt : state.checkedAt).toISOString(),
      };

      if (state.ok) {
        payload['status'] = 'Credentials validated against Namecheap API.';
        if (splitSources) {
          payload['note'] =
            'Credentials are split across sources (see `sources`). Validation passed, ' +
            'but if you ever update one and it stops working, check whether a shell ' +
            'export is shadowing the config file.';
        }
      } else {
        payload['status'] = state.code === 'UNCONFIGURED'
          ? 'Not configured — run the `setup` tool to enter API credentials.'
          : `Authentication failed — code ${state.code}`;
        payload['errorCode'] = state.code;
        payload['errorMessage'] = state.message;

        const hints: string[] = [];

        if (splitSources) {
          const shellKeys = REQUIRED_KEYS.filter((k) => sources[k] === 'shell');
          const fileKeys = REQUIRED_KEYS.filter(
            (k) => sources[k] === 'user-config' || sources[k] === 'project-env',
          );
          if (shellKeys.length > 0 && fileKeys.length > 0) {
            hints.push(
              `Credentials are split: ${shellKeys.join(', ')} from shell env; ` +
              `${fileKeys.join(', ')} from config file. ` +
              `A stale shell export can silently shadow the file value (dotenv doesn't override existing env vars). ` +
              `Fix either: (a) unset the shell export(s) and restart Claude Code so the MCP re-spawns clean, ` +
              `or (b) update your shell rc so ALL three required vars come from the same source.`,
            );
          }
        }

        if (state.code === '1011102' || state.code === '1011150') {
          hints.push(
            'Error 1011102/1011150 means EITHER the API key is invalid OR the client IP is not whitelisted. ' +
            'Visit ap.www.namecheap.com/settings/tools/apiaccess/ to verify both: ' +
            `the key matches what's sent, and the whitelist includes ${clientIp ?? 'your current public IP'}.`,
          );
        }

        if (currentPublicIp && clientIp && !ipMatchesConfigured) {
          hints.push(
            `Your current public IP (${currentPublicIp}) does not match the configured NAMECHEAP_CLIENT_IP (${clientIp}). ` +
            `If your network changed (VPN, new location) since setup, update NAMECHEAP_CLIENT_IP via the setup tool ` +
            `and whitelist the new IP at ap.www.namecheap.com/settings/tools/apiaccess/.`,
          );
        }

        if (!configFileExists && sources['NAMECHEAP_API_KEY'] === 'missing') {
          hints.push('Run the `setup` tool to create ~/.config/namecheap-mcp/.env.');
        }

        if (hints.length > 0) payload['hints'] = hints;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );
}
