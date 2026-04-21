import { describe, it, expect } from 'vitest';
import { recordMatches } from '../../src/dns-matching.js';
import type { HostRecord } from '../../src/types.js';

// Simulate the update_dns_record upsert algorithm (pure — no MCP server needed).
// Finds a matching record and replaces it, or appends if not found.
function upsert(
  current: HostRecord[],
  target: { hostName: string; recordType: string; address: string; ttl?: number; mxPref?: number },
): HostRecord[] {
  const idx = current.findIndex((h) => recordMatches(h, target));
  const newRecord: HostRecord = {
    hostName: target.hostName,
    recordType: target.recordType,
    address: target.address,
    ttl: target.ttl ?? 1800,
    mxPref: target.mxPref,
  };
  if (idx >= 0) {
    const out = [...current];
    out[idx] = newRecord;
    return out;
  }
  return [...current, newRecord];
}

function del(
  current: HostRecord[],
  target: { hostName: string; recordType: string; address?: string },
): HostRecord[] {
  return current.filter((h) => !recordMatches(h, target));
}

describe('recordMatches — single-value types', () => {
  it('matches A record by hostName+type (address differences ignored for upsert)', () => {
    const h: HostRecord = { hostName: '@', recordType: 'A', address: '1.2.3.4' };
    expect(recordMatches(h, { hostName: '@', recordType: 'A', address: '5.6.7.8' })).toBe(true);
  });

  it('does not match across different hostNames', () => {
    const h: HostRecord = { hostName: '@', recordType: 'A', address: '1.2.3.4' };
    expect(recordMatches(h, { hostName: 'www', recordType: 'A', address: '1.2.3.4' })).toBe(false);
  });

  it('does not match across different types', () => {
    const h: HostRecord = { hostName: '@', recordType: 'A', address: '1.2.3.4' };
    expect(recordMatches(h, { hostName: '@', recordType: 'AAAA', address: '1.2.3.4' })).toBe(false);
  });

  it('upserting an A record at an existing hostName replaces (single-value semantics)', () => {
    const zone: HostRecord[] = [{ hostName: '@', recordType: 'A', address: '1.2.3.4' }];
    const out = upsert(zone, { hostName: '@', recordType: 'A', address: '5.6.7.8' });
    expect(out).toHaveLength(1);
    expect(out[0].address).toBe('5.6.7.8');
  });
});

describe('recordMatches — TXT (the v1.4.1 footgun)', () => {
  const zone: HostRecord[] = [
    { hostName: '@', recordType: 'TXT', address: 'v=spf1 include:_spf.google.com ~all' },
    { hostName: '@', recordType: 'TXT', address: 'google-site-verification=abc123' },
    { hostName: '@', recordType: 'TXT', address: 'openai-verification=xyz789' },
  ];

  it('does NOT match a TXT with a different body at the same hostName', () => {
    expect(
      recordMatches(zone[0], {
        hostName: '@',
        recordType: 'TXT',
        address: 'google-site-verification=abc123',
      }),
    ).toBe(false);
  });

  it('DOES match a TXT with the same body at the same hostName', () => {
    expect(
      recordMatches(zone[1], {
        hostName: '@',
        recordType: 'TXT',
        address: 'google-site-verification=abc123',
      }),
    ).toBe(true);
  });

  it('upserting a 4th distinct TXT at @ preserves all 3 existing TXTs', () => {
    const out = upsert(zone, {
      hostName: '@',
      recordType: 'TXT',
      address: 'anthropic-verification=claude123',
    });
    expect(out).toHaveLength(4);
    const bodies = out.map((r) => r.address);
    expect(bodies).toContain('v=spf1 include:_spf.google.com ~all');
    expect(bodies).toContain('google-site-verification=abc123');
    expect(bodies).toContain('openai-verification=xyz789');
    expect(bodies).toContain('anthropic-verification=claude123');
  });

  it('re-upserting an identical TXT is a no-op (same body matches, replace-in-place)', () => {
    const out = upsert(zone, {
      hostName: '@',
      recordType: 'TXT',
      address: 'google-site-verification=abc123',
    });
    expect(out).toHaveLength(3);
    expect(out.filter((r) => r.address === 'google-site-verification=abc123')).toHaveLength(1);
  });

  it('changing an SPF body is delete-then-upsert (new body appends, not replaces)', () => {
    // This is the safe semantic for multi-value types: if the caller wants to
    // "edit" an SPF string, they must delete the old one first. A silent
    // replace here would risk clobbering an unrelated TXT at the same hostName.
    const appended = upsert(zone, {
      hostName: '@',
      recordType: 'TXT',
      address: 'v=spf1 include:_spf.google.com -all', // changed ~all → -all
    });
    expect(appended).toHaveLength(4);

    const deleted = del(zone, {
      hostName: '@',
      recordType: 'TXT',
      address: 'v=spf1 include:_spf.google.com ~all',
    });
    expect(deleted).toHaveLength(2);

    const final = upsert(deleted, {
      hostName: '@',
      recordType: 'TXT',
      address: 'v=spf1 include:_spf.google.com -all',
    });
    expect(final).toHaveLength(3);
    expect(final.some((r) => r.address === 'v=spf1 include:_spf.google.com -all')).toBe(true);
    expect(final.some((r) => r.address === 'google-site-verification=abc123')).toBe(true);
    expect(final.some((r) => r.address === 'openai-verification=xyz789')).toBe(true);
  });

  it('delete without address removes all TXTs at that hostName', () => {
    const out = del(zone, { hostName: '@', recordType: 'TXT' });
    expect(out).toHaveLength(0);
  });

  it('delete with address removes only the matching TXT', () => {
    const out = del(zone, {
      hostName: '@',
      recordType: 'TXT',
      address: 'openai-verification=xyz789',
    });
    expect(out).toHaveLength(2);
    expect(out.some((r) => r.address === 'v=spf1 include:_spf.google.com ~all')).toBe(true);
    expect(out.some((r) => r.address === 'google-site-verification=abc123')).toBe(true);
  });
});

describe('recordMatches — CAA (multi-value)', () => {
  const zone: HostRecord[] = [
    { hostName: '@', recordType: 'CAA', address: '0 issue "letsencrypt.org"' },
    { hostName: '@', recordType: 'CAA', address: '0 issue "digicert.com"' },
    { hostName: '@', recordType: 'CAA', address: '0 iodef "mailto:ca@example.com"' },
  ];

  it('does not match CAAs with different directives at the same hostName', () => {
    expect(
      recordMatches(zone[0], {
        hostName: '@',
        recordType: 'CAA',
        address: '0 issue "digicert.com"',
      }),
    ).toBe(false);
  });

  it('upserting a 4th CAA preserves the existing three', () => {
    const out = upsert(zone, {
      hostName: '@',
      recordType: 'CAA',
      address: '0 issuewild ";"',
    });
    expect(out).toHaveLength(4);
  });
});

describe('recordMatches — MX (regression guard for existing behavior)', () => {
  const zone: HostRecord[] = [
    { hostName: '@', recordType: 'MX', address: 'mx1.example.com.', mxPref: 10 },
    { hostName: '@', recordType: 'MX', address: 'mx2.example.com.', mxPref: 20 },
  ];

  it('does not match a third MX at the same hostName with a different address', () => {
    expect(
      recordMatches(zone[0], {
        hostName: '@',
        recordType: 'MX',
        address: 'mx2.example.com.',
      }),
    ).toBe(false);
  });

  it('matches an MX with the same address at the same hostName', () => {
    expect(
      recordMatches(zone[0], {
        hostName: '@',
        recordType: 'MX',
        address: 'mx1.example.com.',
      }),
    ).toBe(true);
  });

  it('upserting a 3rd distinct MX preserves the existing two', () => {
    const out = upsert(zone, {
      hostName: '@',
      recordType: 'MX',
      address: 'mx3.example.com.',
      mxPref: 30,
    });
    expect(out).toHaveLength(3);
  });

  it('delete without address removes all MXs at that hostName', () => {
    const out = del(zone, { hostName: '@', recordType: 'MX' });
    expect(out).toHaveLength(0);
  });
});

describe('recordMatches — NS (multi-value)', () => {
  it('does not clobber a second NS at a delegated subdomain', () => {
    const zone: HostRecord[] = [
      { hostName: 'delegated', recordType: 'NS', address: 'ns1.other.example.' },
      { hostName: 'delegated', recordType: 'NS', address: 'ns2.other.example.' },
    ];
    const out = upsert(zone, {
      hostName: 'delegated',
      recordType: 'NS',
      address: 'ns3.other.example.',
    });
    expect(out).toHaveLength(3);
  });
});

describe('recordMatches — address omitted (delete-all semantics)', () => {
  it('on TXT delete with no address, matches all TXTs at hostName regardless of body', () => {
    const zone: HostRecord[] = [
      { hostName: '_dmarc', recordType: 'TXT', address: 'v=DMARC1; p=none' },
      { hostName: '_dmarc', recordType: 'TXT', address: 'unrelated=whatever' },
      { hostName: '@', recordType: 'TXT', address: 'v=spf1 -all' },
    ];
    const out = del(zone, { hostName: '_dmarc', recordType: 'TXT' });
    expect(out).toHaveLength(1);
    expect(out[0].hostName).toBe('@');
  });

  it('empty-string address is treated as a literal value, NOT as "any"', () => {
    // Regression guard: an earlier version used a truthy check on target.address,
    // which would have made address:'' fall through to match-all and silently
    // clobber unrelated TXT records. The contract is now: undefined means "any",
    // '' is a literal exact-match.
    const zone: HostRecord[] = [
      { hostName: '@', recordType: 'TXT', address: 'v=spf1 -all' },
      { hostName: '@', recordType: 'TXT', address: 'google-site-verification=abc' },
    ];
    expect(
      recordMatches(zone[0], { hostName: '@', recordType: 'TXT', address: '' }),
    ).toBe(false);
    // Delete with address:'' matches nothing (no record has empty address).
    expect(del(zone, { hostName: '@', recordType: 'TXT', address: '' })).toHaveLength(2);
  });
});
