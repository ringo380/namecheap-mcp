import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import dotenv from 'dotenv';
import axios from 'axios';
import { NamecheapApiError } from './types.js';
export const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'namecheap-mcp');
export const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, '.env');
export const UNCONFIGURED_MSG = 'namecheap-mcp is not configured. Call the `setup` tool to get started, ' +
    'or set NAMECHEAP_API_USER, NAMECHEAP_API_KEY, and NAMECHEAP_CLIENT_IP ' +
    'environment variables and restart the server.';
// The three credentials that must be present for the client to authenticate.
// Used by auth_status and the setup split-source hint to detect when values
// come from different origins (shell vs file). Exported so callers stay in
// sync — if a key is added here, both tools pick it up automatically.
export const REQUIRED_CREDENTIAL_KEYS = [
    'NAMECHEAP_API_USER',
    'NAMECHEAP_API_KEY',
    'NAMECHEAP_CLIENT_IP',
];
const ENV_KEYS = [
    ...REQUIRED_CREDENTIAL_KEYS,
    'NAMECHEAP_USERNAME',
    'NAMECHEAP_SANDBOX',
];
// Snapshot which keys were present in process.env BEFORE loadConfig() runs.
// Captured at module-load so the import in index.ts runs this before loadConfig().
// Empty strings are treated as unset here to match loadConfig() precedence —
// a shell-pre-seeded "" must not shadow a real file value.
const preDotenvSnapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, !!process.env[k]?.trim()]));
/**
 * Load credentials from ~/.config/namecheap-mcp/.env then ./.env.
 * Precedence: non-empty shell/host env > user-config file > project-local .env.
 * An empty-string process.env value is treated as unset — dotenv's default
 * behavior (never override existing keys) silently shadowed file values when
 * the shell exported "" or partial credentials. See issue #4.
 */
export function loadConfig() {
    const userFile = parseEnvFile(USER_CONFIG_PATH);
    const projectFile = parseEnvFile(path.resolve(process.cwd(), '.env'));
    for (const key of ENV_KEYS) {
        const current = process.env[key];
        if (current && current.trim() !== '')
            continue;
        const fallback = userFile[key]?.trim() || projectFile[key]?.trim();
        if (fallback)
            process.env[key] = fallback;
    }
}
function parseEnvFile(filePath) {
    try {
        if (!fs.existsSync(filePath))
            return {};
        return dotenv.parse(fs.readFileSync(filePath));
    }
    catch {
        return {};
    }
}
/**
 * Determine where each credential came from: shell/host env (captured pre-dotenv),
 * the user config file, the project-local .env, or missing entirely.
 * Lets auth_status surface the "split sources" footgun: e.g. shell exports
 * NAMECHEAP_API_KEY stale while ~/.config/namecheap-mcp/.env has the correct one
 * — the shell value silently wins because dotenv doesn't override existing env vars.
 */
export function getCredentialSources() {
    const userFile = parseEnvFile(USER_CONFIG_PATH);
    const projectFile = parseEnvFile(path.resolve(process.cwd(), '.env'));
    const result = {};
    for (const key of ENV_KEYS) {
        if (preDotenvSnapshot[key]) {
            result[key] = 'shell';
        }
        else if (userFile[key] !== undefined && userFile[key] !== '') {
            result[key] = 'user-config';
        }
        else if (projectFile[key] !== undefined && projectFile[key] !== '') {
            result[key] = 'project-env';
        }
        else {
            result[key] = 'missing';
        }
    }
    return result;
}
/**
 * Read credentials from process.env. Returns null if any required var is missing.
 */
export function readConfig() {
    const apiUser = process.env['NAMECHEAP_API_USER'] ?? '';
    const apiKey = process.env['NAMECHEAP_API_KEY'] ?? '';
    const clientIp = process.env['NAMECHEAP_CLIENT_IP'] ?? '';
    if (!apiUser || !apiKey || !clientIp)
        return null;
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
export function requireClient(getClient) {
    const c = getClient();
    if (!c)
        throw new Error(UNCONFIGURED_MSG);
    return c;
}
/**
 * Escape a value for safe writing into a .env file.
 * Wraps the value in double quotes and escapes embedded backslashes and quotes.
 */
export function escapeEnvValue(val) {
    return '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
// Cache the detected public IP for a short window so diagnostic tools that
// rapid-fire auth_status don't each pay the 2s network cost. IP can only
// change via NAT/VPN/wifi rejoin — events that happen rarely within a
// single Claude Code session, and 60s staleness is an acceptable tradeoff
// for a diagnostic surface (users can always call setup to re-detect).
const IP_CACHE_TTL_MS = 60_000;
let cachedIp = null;
/**
 * Detect the caller's public IP via ipify. Returns null on any error.
 * Result is cached for 60s across calls in the same process.
 */
export async function detectPublicIp() {
    const now = Date.now();
    if (cachedIp && now - cachedIp.at < IP_CACHE_TTL_MS) {
        return cachedIp.value;
    }
    try {
        const res = await axios.get('https://api.ipify.org?format=json', { timeout: 2000 });
        const ip = res.data.ip ?? null;
        cachedIp = { value: ip, at: now };
        return ip;
    }
    catch {
        // Cache the failure too so a down ipify doesn't add 2s latency to
        // every subsequent auth_status call in the TTL window.
        cachedIp = { value: null, at: now };
        return null;
    }
}
/**
 * Ping the Namecheap API with credentials to confirm they work.
 * Uses getBalances (cheap, read-only, requires auth).
 * Returns a structured result; never throws.
 */
export async function validateClient(client) {
    try {
        await client.execute('namecheap.users.getBalances', {});
        return { ok: true };
    }
    catch (err) {
        if (err instanceof NamecheapApiError) {
            return { ok: false, code: err.code, message: err.message };
        }
        return { ok: false, code: 'UNKNOWN', message: err instanceof Error ? err.message : String(err) };
    }
}
//# sourceMappingURL=config.js.map