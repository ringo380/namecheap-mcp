import { NamecheapConfig, HostRecord } from './types.js';
export declare const AUTH_CODES: ReadonlySet<string>;
export declare class NamecheapClient {
    private readonly config;
    private readonly baseUrl;
    constructor(config: NamecheapConfig);
    /**
     * Execute a Namecheap API command.
     * Returns the CommandResponse subtree from the parsed XML.
     */
    execute(command: string, params?: Record<string, string | number>, method?: 'GET' | 'POST', retries?: number): Promise<unknown>;
    /**
     * Split a registrable domain name into SLD and TLD for Namecheap DNS API params.
     * "example.com" → { sld: "example", tld: "com" }
     * "example.co.uk" → { sld: "example", tld: "co.uk" }
     * Rejects subdomains (e.g. "mail.example.com") — Namecheap DNS API operates on
     * registrable domains only; subdomains are managed as host records within the zone.
     */
    splitDomain(domainName: string): {
        sld: string;
        tld: string;
    };
    /**
     * Flatten an array of host records into the indexed param format
     * required by namecheap.domains.dns.setHosts.
     */
    flattenHostRecords(hosts: HostRecord[]): Record<string, string>;
}
