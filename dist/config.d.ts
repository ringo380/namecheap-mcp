import type { NamecheapConfig } from './types.js';
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
