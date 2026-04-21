import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { NamecheapConfig, HostRecord, NamecheapApiError } from './types.js';

// Namecheap error codes that indicate an authentication/authorization problem
// (bad API key, non-whitelisted IP, disabled API access) rather than a
// business-logic failure. Used to distinguish "credentials broken" from
// "request malformed" in structured error payloads and auth_status.
export const AUTH_CODES: ReadonlySet<string> = new Set([
  '1011102', // Parameter ApiKey is invalid
  '1011150', // IP is not in the whitelist / disabled IP
  '1010102', // Parameter APIUser is invalid
  '1017',    // API Key is invalid or API access has not been enabled
  '1011101', // Parameter ApiUser is invalid
  '1050900', // Unknown exceptions (often auth-related)
]);

// Tags that can appear 0, 1, or N times — must be forced to arrays.
// NOTE: Namecheap's getHosts response uses lowercase `<host>` (confirmed by
// live API capture). Other responses use PascalCase. We list both variants
// here so any future API response shape using either case works out of the
// box. Missing a tag here caused the v1.0-1.4.0 wipe bug: `host` (lowercase)
// was absent, parsing fell through, getHosts silently returned an empty
// hosts array, and downstream setHosts calls wiped the zone.
const ARRAY_TAGS = new Set([
  'DomainCheckResult',
  'Domain',
  'Host',
  'host',
  'EmailForward',
  'SSL',
  'Transfer',
  'Nameserver',
  'ProductType',
  'ProductCategory',
  'Product',
  'Price',
  'Error',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName: string) => ARRAY_TAGS.has(tagName),
  parseAttributeValue: false,
  trimValues: true,
});

export class NamecheapClient {
  private readonly baseUrl: string;
  // Last raw XML body received from the API, per-instance. Used by dns.ts
  // to dump the response body to stderr when parseGetHostsResponse throws
  // (gated on NAMECHEAP_DEBUG). MCP serializes tool calls so the race on
  // this field between calls is acceptable for a diagnostic surface.
  private _lastRawResponse: string | null = null;
  get lastRawResponse(): string | null { return this._lastRawResponse; }

  constructor(private readonly config: NamecheapConfig) {
    this.baseUrl = config.sandbox
      ? 'https://api.sandbox.namecheap.com/xml.response'
      : 'https://api.namecheap.com/xml.response';
  }

  /**
   * Execute a Namecheap API command.
   * Returns the CommandResponse subtree from the parsed XML.
   */
  async execute(
    command: string,
    params: Record<string, string | number> = {},
    method: 'GET' | 'POST' = 'GET',
    retries = 0
  ): Promise<unknown> {
    const authParams: Record<string, string> = {
      ApiUser: this.config.apiUser,
      ApiKey: this.config.apiKey,
      UserName: this.config.userName,
      ClientIp: this.config.clientIp,
      Command: command,
    };

    const allParams = { ...authParams, ...params };

    let responseXml: string;

    try {
      if (method === 'POST') {
        const body = new URLSearchParams(
          Object.fromEntries(
            Object.entries(allParams).map(([k, v]) => [k, String(v)])
          )
        );
        const response = await axios.post(this.baseUrl, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000,
          responseType: 'text',
        });
        responseXml = response.data as string;
      } else {
        const response = await axios.get(this.baseUrl, {
          params: allParams,
          timeout: 30000,
          responseType: 'text',
        });
        responseXml = response.data as string;
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // Exponential backoff on rate-limit: up to 3 retries with 1s/2s/4s
        // waits (7s total wait cap; 4 HTTP calls total including the initial).
        // Applies to both GET and POST — the API rate-limits both, and the
        // previous single-retry behaviour blew past the limit on rapid
        // multi-record upsert scripts.
        if (err.response?.status === 429 && retries < 3) {
          await sleep(1000 * Math.pow(2, retries));
          return this.execute(command, params, method, retries + 1);
        }
        throw new Error(`HTTP error ${err.response?.status ?? 'unknown'}: ${err.message}`);
      }
      throw err;
    }

    this._lastRawResponse = responseXml;

    const parsed = parser.parse(responseXml) as {
      ApiResponse?: {
        '@_Status'?: string;
        Errors?: { Error?: Array<{ '@_Number'?: string; '#text'?: string }> | { '@_Number'?: string; '#text'?: string } };
        CommandResponse?: unknown;
      };
    };

    const apiResponse = parsed.ApiResponse;
    if (!apiResponse) {
      throw new Error(`Unexpected response format from Namecheap API for command: ${command}`);
    }

    if (apiResponse['@_Status'] === 'ERROR') {
      const errors = apiResponse.Errors?.Error;
      const errorList = Array.isArray(errors) ? errors : errors ? [errors] : [];
      const first = errorList[0];
      const code = String(first?.['@_Number'] ?? 'UNKNOWN');
      let message = String(first?.['#text'] ?? 'Unknown error');
      const ERROR_HINTS: Record<string, string> = {
        '1011102': ' — ensure NAMECHEAP_CLIENT_IP is whitelisted at ap.www.namecheap.com/settings/tools/apiaccess/',
        '1011150': ' — ensure NAMECHEAP_CLIENT_IP is whitelisted at ap.www.namecheap.com/settings/tools/apiaccess/',
        '2016166': ' — domain not found in your account',
        '2019166': ' — domain is locked; use set_registrar_lock to unlock before this operation',
        '3031510': ' — insufficient account balance',
        '2030280': ' — invalid nameserver format',
      };
      const hint = ERROR_HINTS[code];
      if (hint) message += hint;
      throw new NamecheapApiError(message, code, command);
    }

    return apiResponse.CommandResponse;
  }

  /**
   * Split a registrable domain name into SLD and TLD for Namecheap DNS API params.
   * "example.com" → { sld: "example", tld: "com" }
   * "example.co.uk" → { sld: "example", tld: "co.uk" }
   * Rejects subdomains (e.g. "mail.example.com") — Namecheap DNS API operates on
   * registrable domains only; subdomains are managed as host records within the zone.
   */
  splitDomain(domainName: string): { sld: string; tld: string } {
    const parts = domainName.replace(/\.$/, '').split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid domain name: ${domainName}`);
    }
    // Allow two-part TLDs (e.g. co.uk, com.au) — max 3 parts total for a registrable domain.
    // Four or more parts (e.g. mail.example.co.uk) means a subdomain was passed.
    if (parts.length > 3) {
      throw new Error(
        `"${domainName}" appears to be a subdomain. Namecheap DNS tools require a registrable domain (e.g. "example.com" or "example.co.uk"), not a subdomain. Manage subdomains as host records within the zone.`
      );
    }
    return {
      sld: parts[0],
      tld: parts.slice(1).join('.'),
    };
  }

  /**
   * Flatten an array of host records into the indexed param format
   * required by namecheap.domains.dns.setHosts.
   */
  flattenHostRecords(hosts: HostRecord[]): Record<string, string> {
    return hosts.reduce<Record<string, string>>((acc, host, i) => {
      const n = i + 1;
      acc[`HostName${n}`] = host.hostName;
      acc[`RecordType${n}`] = host.recordType;
      acc[`Address${n}`] = host.address;
      acc[`TTL${n}`] = String(host.ttl ?? 1800);
      if (host.mxPref !== undefined) {
        acc[`MXPref${n}`] = String(host.mxPref);
      }
      return acc;
    }, {});
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
