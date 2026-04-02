import * as path from 'node:path';
import * as os from 'node:os';
import dotenv from 'dotenv';
import axios from 'axios';
import type { NamecheapConfig } from './types.js';
import type { NamecheapClient } from './client.js';

export const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'namecheap-mcp');
export const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, '.env');

export const UNCONFIGURED_MSG =
  'namecheap-mcp is not configured. Call the `setup` tool to get started, ' +
  'or set NAMECHEAP_API_USER, NAMECHEAP_API_KEY, and NAMECHEAP_CLIENT_IP ' +
  'environment variables and restart the server.';

/**
 * Load credentials from ~/.config/namecheap-mcp/.env then ./.env.
 * Already-set process.env values take precedence (MCP host env vars win).
 * Call once at server startup before reading process.env.
 */
export function loadConfig(): void {
  dotenv.config({ path: USER_CONFIG_PATH });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

/**
 * Read credentials from process.env. Returns null if any required var is missing.
 */
export function readConfig(): NamecheapConfig | null {
  const apiUser = process.env['NAMECHEAP_API_USER'] ?? '';
  const apiKey = process.env['NAMECHEAP_API_KEY'] ?? '';
  const clientIp = process.env['NAMECHEAP_CLIENT_IP'] ?? '';
  if (!apiUser || !apiKey || !clientIp) return null;
  return {
    apiUser,
    apiKey,
    userName: process.env['NAMECHEAP_USERNAME'] ?? apiUser,
    clientIp,
    sandbox: process.env['NAMECHEAP_SANDBOX'] === 'true',
  };
}

/**
 * Assert that the client is initialized. Throws UNCONFIGURED_MSG if null.
 * Used at the top of every tool handler that requires credentials.
 */
export function requireClient(getClient: () => NamecheapClient | null): NamecheapClient {
  const c = getClient();
  if (!c) throw new Error(UNCONFIGURED_MSG);
  return c;
}

/**
 * Escape a value for safe writing into a .env file.
 * Wraps the value in double quotes and escapes embedded backslashes and quotes.
 */
export function escapeEnvValue(val: string): string {
  return '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * Detect the caller's public IP via ipify. Returns null on any error.
 */
export async function detectPublicIp(): Promise<string | null> {
  try {
    const res = await axios.get<{ ip: string }>('https://api.ipify.org?format=json', { timeout: 5000 });
    return res.data.ip ?? null;
  } catch {
    return null;
  }
}
