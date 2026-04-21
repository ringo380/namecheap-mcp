import type { HostRecord } from './types.js';
export type RawHost = Record<string, string>;
export interface ParsedHostsResponse {
    domain: string;
    usingNamecheapDns: boolean;
    emailType: string;
    hosts: HostRecord[];
    raw: RawHost[];
}
/**
 * Strict parser for namecheap.domains.dns.getHosts responses.
 * Throws with a specific error if the response shape is unexpected — the old
 * behaviour of silently returning [] would cause update_dns_record to write
 * an empty record set, wiping the entire zone.
 */
export declare function parseGetHostsResponse(result: unknown): ParsedHostsResponse;
