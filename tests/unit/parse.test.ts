import { describe, it, expect } from 'vitest';
import { parseGetHostsResponse } from '../../src/parse.js';

describe('parseGetHostsResponse', () => {
  it('parses a canonical response with multiple hosts', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        '@_EmailType': 'MX',
        Host: [
          { '@_HostId': '1', '@_Name': '@', '@_Type': 'A', '@_Address': '1.2.3.4', '@_TTL': '1800', '@_MXPref': '0', '@_IsActive': 'true' },
          { '@_HostId': '2', '@_Name': 'www', '@_Type': 'CNAME', '@_Address': 'example.com.', '@_TTL': '1800' },
          { '@_HostId': '3', '@_Name': '@', '@_Type': 'MX', '@_Address': 'mail.example.com.', '@_TTL': '1800', '@_MXPref': '10' },
        ],
      },
    });

    expect(result.domain).toBe('example.com');
    expect(result.usingNamecheapDns).toBe(true);
    expect(result.emailType).toBe('MX');
    expect(result.hosts).toHaveLength(3);
    expect(result.hosts[0]).toEqual({
      hostName: '@',
      recordType: 'A',
      address: '1.2.3.4',
      mxPref: 0,
      ttl: 1800,
    });
    expect(result.hosts[2].mxPref).toBe(10);
  });

  it('parses a single-host (non-array) response', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        '@_EmailType': 'NONE',
        Host: { '@_Name': '@', '@_Type': 'A', '@_Address': '1.2.3.4', '@_TTL': '1800' },
      },
    });
    expect(result.hosts).toHaveLength(1);
    expect(result.hosts[0].address).toBe('1.2.3.4');
  });

  it('parses an empty zone', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        '@_EmailType': 'NONE',
      },
    });
    expect(result.hosts).toHaveLength(0);
    expect(result.usingNamecheapDns).toBe(true);
  });

  it('THROWS on a missing DomainDNSGetHostsResult envelope (the wipe-prevention guard)', () => {
    expect(() => parseGetHostsResponse({ SomeOtherShape: { Host: [] } })).toThrow(
      /missing DomainDNSGetHostsResult/
    );
  });

  it('THROWS on non-object input', () => {
    expect(() => parseGetHostsResponse(null)).toThrow(/non-object/);
    expect(() => parseGetHostsResponse('string')).toThrow(/non-object/);
    expect(() => parseGetHostsResponse(42)).toThrow(/non-object/);
  });

  it('THROWS on a Host element missing @_Name', () => {
    expect(() =>
      parseGetHostsResponse({
        DomainDNSGetHostsResult: {
          '@_Domain': 'example.com',
          '@_IsUsingOurDNS': 'true',
          Host: [{ '@_Type': 'A', '@_Address': '1.2.3.4' }],
        },
      }),
    ).toThrow(/missing required @_Name/);
  });

  it('THROWS on a Host element missing @_Type', () => {
    expect(() =>
      parseGetHostsResponse({
        DomainDNSGetHostsResult: {
          '@_Domain': 'example.com',
          '@_IsUsingOurDNS': 'true',
          Host: [{ '@_Name': '@', '@_Address': '1.2.3.4' }],
        },
      }),
    ).toThrow(/missing required @_Name\/@_Type/);
  });

  it('handles IsUsingOurDNS=false (custom nameservers) correctly', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'false',
        '@_EmailType': 'NONE',
      },
    });
    expect(result.usingNamecheapDns).toBe(false);
    expect(result.hosts).toHaveLength(0);
  });

  it('preserves ALIAS, CAA, MXE record types without choking', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        Host: [
          { '@_Name': '@', '@_Type': 'ALIAS', '@_Address': 'target.example.net.', '@_TTL': '300' },
          { '@_Name': '@', '@_Type': 'CAA', '@_Address': '0 issue "letsencrypt.org"', '@_TTL': '300' },
          { '@_Name': '@', '@_Type': 'MXE', '@_Address': 'mail.example.com.', '@_TTL': '300' },
        ],
      },
    });
    expect(result.hosts.map((h) => h.recordType)).toEqual(['ALIAS', 'CAA', 'MXE']);
    expect(result.hosts[1].address).toBe('0 issue "letsencrypt.org"');
  });

  it('TTL defaults to 1800 when missing or empty', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        Host: [
          { '@_Name': '@', '@_Type': 'A', '@_Address': '1.2.3.4' },
          { '@_Name': 'www', '@_Type': 'A', '@_Address': '1.2.3.4', '@_TTL': '' },
        ],
      },
    });
    expect(result.hosts[0].ttl).toBe(1800);
    expect(result.hosts[1].ttl).toBe(1800);
  });

  it('REGRESSION: parses lowercase <host> tag (the real Namecheap getHosts shape)', () => {
    // Captured from live Namecheap API on 2026-04-20. The API returns `<host>`
    // lowercase; pre-v1.4.1 code looked for `Host` (capital) and silently
    // returned [], which caused every downstream setHosts to wipe the zone.
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'robworks.info',
        '@_EmailType': 'MX',
        '@_IsUsingOurDNS': 'true',
        host: [
          {
            '@_HostId': '504559904',
            '@_Name': 'signals',
            '@_Type': 'A',
            '@_Address': '76.76.21.21',
            '@_MXPref': '10',
            '@_TTL': '1800',
            '@_AssociatedAppTitle': '',
            '@_FriendlyName': '',
            '@_IsActive': 'true',
            '@_IsDDNSEnabled': 'false',
          },
        ],
      },
    });
    expect(result.hosts).toHaveLength(1);
    expect(result.hosts[0]).toEqual({
      hostName: 'signals',
      recordType: 'A',
      address: '76.76.21.21',
      mxPref: 10,
      ttl: 1800,
    });
  });

  it('still parses capital <Host> tag for future-proofing', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        Host: [{ '@_Name': '@', '@_Type': 'A', '@_Address': '1.2.3.4', '@_TTL': '300' }],
      },
    });
    expect(result.hosts).toHaveLength(1);
    expect(result.hosts[0].address).toBe('1.2.3.4');
  });

  it('mxPref is undefined (not 0) when absent, so A-record round-trip does not leak MX params', () => {
    const result = parseGetHostsResponse({
      DomainDNSGetHostsResult: {
        '@_Domain': 'example.com',
        '@_IsUsingOurDNS': 'true',
        Host: [
          { '@_Name': '@', '@_Type': 'A', '@_Address': '1.2.3.4', '@_TTL': '1800' },
        ],
      },
    });
    expect(result.hosts[0].mxPref).toBeUndefined();
  });
});
