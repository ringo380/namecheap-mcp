import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NamecheapClient } from '../client.js';
import { HostRecord } from '../types.js';
import { requireClient } from '../config.js';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'URL', 'URL301', 'FRAME'] as const;

type RawHost = Record<string, string>;

function parseHosts(result: unknown): RawHost[] {
  const r = (result as Record<string, unknown>)?.['DomainDNSGetHostsResult'] as Record<string, unknown> | undefined;
  const raw = r?.['Host'];
  return Array.isArray(raw) ? raw as RawHost[] : raw ? [raw as RawHost] : [];
}

function cleanHosts(result: unknown): { domain: string; usingNamecheapDns: boolean; emailType: string; hosts: unknown[] } {
  const r = (result as Record<string, unknown>)?.['DomainDNSGetHostsResult'] as Record<string, string & Record<string, unknown>> | undefined;
  const raw = r?.['Host'];
  const list: RawHost[] = Array.isArray(raw) ? raw as RawHost[] : raw ? [raw as RawHost] : [];
  return {
    domain: r?.['@_Domain'] ?? '',
    usingNamecheapDns: r?.['@_IsUsingOurDNS'] === 'true',
    emailType: r?.['@_EmailType'] ?? '',
    hosts: list.map(h => ({
      id: h['@_HostId'],
      name: h['@_Name'],
      type: h['@_Type'],
      address: h['@_Address'],
      ttl: parseInt(h['@_TTL'] ?? '1800', 10),
      mxPref: parseInt(h['@_MXPref'] ?? '0', 10),
      active: h['@_IsActive'] === 'true',
    })),
  };
}

export function registerDnsTools(server: McpServer, getClient: () => NamecheapClient | null): void {

  server.registerTool(
    'get_dns_hosts',
    {
      description: 'Get all DNS host records for a domain (A, AAAA, CNAME, MX, TXT, NS, etc.).',
      inputSchema: { domainName: z.string().describe('The domain name, e.g. "example.com"') },
    },
    async ({ domainName }) => {
      try {
        const client = requireClient(getClient);
        const { sld, tld } = client.splitDomain(domainName);
        const result = await client.execute('namecheap.domains.dns.getHosts', { SLD: sld, TLD: tld });
        return { content: [{ type: 'text', text: JSON.stringify(cleanHosts(result), null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'set_dns_hosts',
    {
      description: 'DESTRUCTIVE: Replaces ALL DNS host records for a domain with the provided list. Any records not included will be deleted. Always call get_dns_hosts first to retrieve current records if you want to preserve them.',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        hosts: z.array(z.object({
          hostName: z.string().describe('Host/subdomain name. Use "@" for root, "*" for wildcard.'),
          recordType: z.enum(RECORD_TYPES).describe('DNS record type'),
          address: z.string().describe('Record value (IP address, hostname, or URL)'),
          mxPref: z.number().int().min(0).max(65535).optional().describe('MX priority (required for MX records, 0–65535)'),
          ttl: z.number().int().optional().describe('TTL in seconds (default: 1800)'),
        }).refine(
          (r) => r.recordType !== 'MX' || r.mxPref !== undefined,
          { message: 'mxPref is required for MX records', path: ['mxPref'] }
        )).describe('Complete list of DNS records to set. Replaces all existing records.'),
      },
    },
    async ({ domainName, hosts }) => {
      try {
        const client = requireClient(getClient);
        const { sld, tld } = client.splitDomain(domainName);
        const hostParams = client.flattenHostRecords(hosts as HostRecord[]);
        const result = await client.execute(
          'namecheap.domains.dns.setHosts',
          { SLD: sld, TLD: tld, ...hostParams },
          'POST'
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'update_dns_record',
    {
      description:
        'Safely adds, updates, or removes a single DNS record without affecting other records. ' +
        'Performs an internal read-modify-write — no need to call get_dns_hosts first. ' +
        'For upsert: finds a matching record by hostName + recordType (MX records also match on address) and replaces it, or appends if not found. ' +
        'For delete: removes the matching record.',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        operation: z.enum(['upsert', 'delete']).describe('"upsert" to add or update a record, "delete" to remove it'),
        record: z.object({
          hostName: z.string().describe('Host/subdomain name. Use "@" for root, "*" for wildcard.'),
          recordType: z.enum(RECORD_TYPES).describe('DNS record type'),
          address: z.string().optional().describe('Record value (required for upsert)'),
          mxPref: z.number().int().min(0).max(65535).optional().describe('MX priority (required for MX upsert)'),
          ttl: z.number().int().optional().describe('TTL in seconds (default: 1800)'),
        }).describe('The record to add, update, or delete'),
      },
    },
    async ({ domainName, operation, record }) => {
      try {
        const client = requireClient(getClient);
        const { sld, tld } = client.splitDomain(domainName);

        if (operation === 'upsert' && !record.address) {
          return { content: [{ type: 'text', text: 'Error: address is required for upsert' }], isError: true };
        }
        if (operation === 'upsert' && record.recordType === 'MX' && record.mxPref === undefined) {
          return { content: [{ type: 'text', text: 'Error: mxPref is required for MX upsert' }], isError: true };
        }

        // Read current records
        const existing = await client.execute('namecheap.domains.dns.getHosts', { SLD: sld, TLD: tld });
        const rawHosts = parseHosts(existing);

        // Convert raw hosts to HostRecord format
        const currentRecords: HostRecord[] = rawHosts.map(h => ({
          hostName: h['@_Name'] ?? '',
          recordType: h['@_Type'] as HostRecord['recordType'],
          address: h['@_Address'] ?? '',
          mxPref: h['@_MXPref'] ? parseInt(h['@_MXPref'], 10) : undefined,
          ttl: h['@_TTL'] ? parseInt(h['@_TTL'], 10) : 1800,
        }));

        // For MX records, also match on address when provided (multiple MX records
        // with different addresses can share the same hostName + recordType).
        // When address is omitted on a delete, match all MX records at that hostName.
        const matches = (h: HostRecord) =>
          h.hostName === record.hostName &&
          h.recordType === record.recordType &&
          (record.recordType !== 'MX' || !record.address || h.address === record.address);

        let updatedRecords: HostRecord[];
        if (operation === 'delete') {
          updatedRecords = currentRecords.filter(h => !matches(h));
        } else {
          const newRecord: HostRecord = {
            hostName: record.hostName,
            recordType: record.recordType as HostRecord['recordType'],
            address: record.address!,
            mxPref: record.mxPref,
            ttl: record.ttl ?? 1800,
          };
          const idx = currentRecords.findIndex(h => matches(h));
          if (idx >= 0) {
            updatedRecords = [...currentRecords];
            updatedRecords[idx] = newRecord;
          } else {
            updatedRecords = [...currentRecords, newRecord];
          }
        }

        const hostParams = client.flattenHostRecords(updatedRecords);
        await client.execute('namecheap.domains.dns.setHosts', { SLD: sld, TLD: tld, ...hostParams }, 'POST');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              operation,
              domain: domainName,
              record: { hostName: record.hostName, type: record.recordType },
              totalRecords: updatedRecords.length,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_email_forwarding',
    {
      description: 'Get all email forwarding rules for a domain.',
      inputSchema: { domainName: z.string().describe('The domain name, e.g. "example.com"') },
    },
    async ({ domainName }) => {
      try {
        const result = await requireClient(getClient).execute('namecheap.domains.dns.getEmailForwarding', { DomainName: domainName });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'set_email_forwarding',
    {
      description: 'DESTRUCTIVE: Replaces ALL email forwarding rules for a domain. Any rules not included will be deleted. Call get_email_forwarding first if you want to preserve existing rules.',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        forwards: z.array(z.object({
          mailbox: z.string().describe('The local part before @, e.g. "info" for info@example.com'),
          forwardTo: z.string().describe('Full destination email address'),
        })).describe('List of forwarding rules'),
      },
    },
    async ({ domainName, forwards }) => {
      try {
        const params: Record<string, string | number> = { DomainName: domainName };
        forwards.forEach((fwd, i) => {
          const n = i + 1;
          params[`MailBox${n}`] = fwd.mailbox;
          params[`ForwardTo${n}`] = fwd.forwardTo;
        });
        const result = await requireClient(getClient).execute('namecheap.domains.dns.setEmailForwarding', params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'set_dns_default',
    {
      description: "Switch a domain back to using Namecheap's default DNS servers. Use this to revert from custom nameservers.",
      inputSchema: { domainName: z.string().describe('The domain name, e.g. "example.com"') },
    },
    async ({ domainName }) => {
      try {
        const client = requireClient(getClient);
        const { sld, tld } = client.splitDomain(domainName);
        const result = await client.execute('namecheap.domains.dns.setDefault', { SLD: sld, TLD: tld });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'set_dns_custom',
    {
      description: 'Set custom nameservers for a domain (e.g. to delegate DNS to Cloudflare, Route53, etc.).',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        nameservers: z.array(z.string()).min(2).max(12)
          .describe('List of nameserver hostnames, e.g. ["ns1.cloudflare.com", "ns2.cloudflare.com"]'),
      },
    },
    async ({ domainName, nameservers }) => {
      try {
        const client = requireClient(getClient);
        const { sld, tld } = client.splitDomain(domainName);
        const result = await client.execute('namecheap.domains.dns.setCustom', {
          SLD: sld,
          TLD: tld,
          Nameservers: nameservers.join(','),
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}
