import { describe, it, expect } from 'vitest';
import { NamecheapClient } from '../../src/client.js';

const client = new NamecheapClient({
  apiUser: 'test',
  apiKey: 'test',
  userName: 'test',
  clientIp: '127.0.0.1',
  sandbox: true,
});

describe('NamecheapClient.splitDomain', () => {
  it('splits a standard domain', () => {
    expect(client.splitDomain('example.com')).toEqual({ sld: 'example', tld: 'com' });
  });

  it('handles two-part TLDs', () => {
    expect(client.splitDomain('example.co.uk')).toEqual({ sld: 'example', tld: 'co.uk' });
    expect(client.splitDomain('example.com.au')).toEqual({ sld: 'example', tld: 'com.au' });
  });

  it('strips a trailing dot', () => {
    expect(client.splitDomain('example.com.')).toEqual({ sld: 'example', tld: 'com' });
  });

  it('rejects 4+-part subdomains (e.g. mail.example.co.uk)', () => {
    // NOTE: The parser cannot reject 3-part inputs like mail.example.com because
    // the same shape is valid for 2-part TLDs (example.co.uk). Anything with
    // 4+ parts is definitively a subdomain and must be rejected.
    expect(() => client.splitDomain('foo.bar.example.com')).toThrow(/subdomain/);
    expect(() => client.splitDomain('mail.example.co.uk')).toThrow(/subdomain/);
  });

  it('rejects bare single-word input', () => {
    expect(() => client.splitDomain('localhost')).toThrow(/Invalid domain/);
  });
});

describe('NamecheapClient.flattenHostRecords', () => {
  it('returns empty object for empty array', () => {
    expect(client.flattenHostRecords([])).toEqual({});
  });

  it('flattens a single record with all fields', () => {
    const out = client.flattenHostRecords([
      { hostName: '@', recordType: 'A', address: '1.2.3.4', ttl: 600 },
    ]);
    expect(out).toEqual({ HostName1: '@', RecordType1: 'A', Address1: '1.2.3.4', TTL1: '600' });
  });

  it('defaults TTL to 1800 when undefined', () => {
    const out = client.flattenHostRecords([
      { hostName: '@', recordType: 'A', address: '1.2.3.4' },
    ]);
    expect(out.TTL1).toBe('1800');
  });

  it('includes MXPref only when defined', () => {
    const out = client.flattenHostRecords([
      { hostName: '@', recordType: 'MX', address: 'mx.example.com.', mxPref: 10 },
      { hostName: '@', recordType: 'A', address: '1.2.3.4' },
    ]);
    expect(out.MXPref1).toBe('10');
    expect('MXPref2' in out).toBe(false);
  });

  it('indexes multiple records starting at 1', () => {
    const out = client.flattenHostRecords([
      { hostName: '@', recordType: 'A', address: '1.2.3.4' },
      { hostName: 'www', recordType: 'CNAME', address: 'example.com.' },
      { hostName: '@', recordType: 'TXT', address: 'v=spf1 -all' },
    ]);
    expect(out.HostName1).toBe('@');
    expect(out.HostName2).toBe('www');
    expect(out.HostName3).toBe('@');
    expect(out.Address3).toBe('v=spf1 -all');
  });
});
