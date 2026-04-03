import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { NamecheapConfig, HostRecord, NamecheapApiError } from './types.js';

// Tags that can appear 0, 1, or N times — must be forced to arrays
const ARRAY_TAGS = new Set([
  'DomainCheckResult',
  'Domain',
  'Host',
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
        if (err.response?.status === 429 && retries < 1) {
          await sleep(1000);
          return this.execute(command, params, method, retries + 1);
        }
        throw new Error(`HTTP error ${err.response?.status ?? 'unknown'}: ${err.message}`);
      }
      throw err;
    }

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
