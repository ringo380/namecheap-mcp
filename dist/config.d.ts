import type { NamecheapConfig } from './types.js';
import type { NamecheapClient } from './client.js';
export declare const USER_CONFIG_DIR: string;
export declare const USER_CONFIG_PATH: string;
export declare const UNCONFIGURED_MSG: string;
/**
 * Load credentials from ~/.config/namecheap-mcp/.env then ./.env.
 * Precedence: non-empty shell/host env > user-config file > project-local .env.
 * An empty-string process.env value is treated as unset — dotenv's default
 * behavior (never override existing keys) silently shadowed file values when
 * the shell exported "" or partial credentials. See issue #4.
 */
export declare function loadConfig(): void;
export type CredentialSource = 'shell' | 'user-config' | 'project-env' | 'missing';
/**
 * Determine where each credential came from: shell/host env (captured pre-dotenv),
 * the user config file, the project-local .env, or missing entirely.
 * Lets auth_status surface the "split sources" footgun: e.g. shell exports
 * NAMECHEAP_API_KEY stale while ~/.config/namecheap-mcp/.env has the correct one
 * — the shell value silently wins because dotenv doesn't override existing env vars.
 */
export declare function getCredentialSources(): Record<string, CredentialSource>;
/**
 * Read credentials from process.env. Returns null if any required var is missing.
 */
export declare function readConfig(): NamecheapConfig | null;
/**
 * Assert that the client is initialized. Throws UNCONFIGURED_MSG if null.
 * Used at the top of every tool handler that requires credentials.
 */
export declare function requireClient(getClient: () => NamecheapClient | null): NamecheapClient;
/**
 * Escape a value for safe writing into a .env file.
 * Wraps the value in double quotes and escapes embedded backslashes and quotes.
 */
export declare function escapeEnvValue(val: string): string;
/**
 * Detect the caller's public IP via ipify. Returns null on any error.
 */
export declare function detectPublicIp(): Promise<string | null>;
/**
 * Ping the Namecheap API with credentials to confirm they work.
 * Uses getBalances (cheap, read-only, requires auth).
 * Returns a structured result; never throws.
 */
export declare function validateClient(client: NamecheapClient): Promise<{
    ok: true;
} | {
    ok: false;
    code: string;
    message: string;
}>;
