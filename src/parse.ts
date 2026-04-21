import type { HostRecord, RecordType } from './types.js';

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
export function parseGetHostsResponse(result: unknown): ParsedHostsResponse {
  if (!result || typeof result !== 'object') {
    throw new Error(
      'getHosts returned a non-object response; refusing to proceed to avoid zone wipe.'
    );
  }
  const r = (result as Record<string, unknown>)['DomainDNSGetHostsResult'];
  if (!r || typeof r !== 'object') {
    throw new Error(
      'getHosts response missing DomainDNSGetHostsResult envelope; refusing to proceed to avoid zone wipe. ' +
      'Raw response keys: ' + Object.keys(result as Record<string, unknown>).join(', ')
    );
  }
  const envelope = r as Record<string, unknown>;
  // Namecheap returns `<host>` (lowercase) in the getHosts XML. Earlier
  // versions of this parser looked only for `Host` (capital), which is
  // absent — that silently produced an empty hosts array and caused every
  // downstream setHosts call to wipe the zone. We now accept either case
  // defensively in case the API response shape ever shifts.
  const rawHostValue = envelope['host'] ?? envelope['Host'];
  const raw: RawHost[] = Array.isArray(rawHostValue)
    ? (rawHostValue as RawHost[])
    : rawHostValue
      ? [rawHostValue as RawHost]
      : [];

  const hosts: HostRecord[] = raw.map((h) => {
    const hostName = h['@_Name'];
    const recordType = h['@_Type'];
    const address = h['@_Address'];
    if (hostName === undefined || recordType === undefined || address === undefined) {
      throw new Error(
        'getHosts response contained a Host element missing required @_Name/@_Type/@_Address attribute; refusing to proceed to avoid zone wipe.'
      );
    }
    return {
      hostName,
      recordType: recordType as RecordType,
      address,
      mxPref: h['@_MXPref'] !== undefined && h['@_MXPref'] !== '' ? parseInt(h['@_MXPref'], 10) : undefined,
      ttl: h['@_TTL'] !== undefined && h['@_TTL'] !== '' ? parseInt(h['@_TTL'], 10) : 1800,
    };
  });

  return {
    domain: (envelope['@_Domain'] as string | undefined) ?? '',
    usingNamecheapDns: envelope['@_IsUsingOurDNS'] === 'true',
    emailType: (envelope['@_EmailType'] as string | undefined) ?? '',
    hosts,
    raw,
  };
}
