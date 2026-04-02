import type { NamecheapConfig } from './types.js';
import type { NamecheapClient } from './client.js';
export declare const USER_CONFIG_DIR: string;
export declare const USER_CONFIG_PATH: string;
export declare const UNCONFIGURED_MSG: string;
/**
 * Load credentials from ~/.config/namecheap-mcp/.env then ./.env.
 * Already-set process.env values take precedence (MCP host env vars win).
 * Call once at server startup before reading process.env.
 */
export declare function loadConfig(): void;
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
