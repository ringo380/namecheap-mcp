import type { HostRecord, RecordType } from './types.js';

// Namecheap record types that can legitimately have multiple records at the same
// (hostName, recordType) tuple. When upserting or deleting one of these, we must
// also match on `address` — otherwise a caller updating one SPF TXT at `@` would
// silently clobber their google-site-verification TXT at the same hostName.
const MULTI_VALUE_TYPES: ReadonlySet<RecordType> = new Set<RecordType>([
  'MX',
  'TXT',
  'CAA',
  'NS',
]);

// Returns true if the two records address the same DNS entry for upsert/delete
// purposes. Pure function — safe to unit-test without an MCP server.
// NOTE: `undefined` address means "any" (delete-all-at-host semantic); an empty
// string is treated as a literal value (exact-match), not as "any".
export function recordMatches(
  existing: HostRecord,
  target: { hostName: string; recordType: string; address?: string },
): boolean {
  if (existing.hostName !== target.hostName) return false;
  if (existing.recordType !== target.recordType) return false;
  if (MULTI_VALUE_TYPES.has(target.recordType as RecordType) && target.address !== undefined) {
    return existing.address === target.address;
  }
  return true;
}

export { MULTI_VALUE_TYPES };
