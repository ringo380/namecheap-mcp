import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NamecheapClient } from '../client.js';
import { HostRecord } from '../types.js';
import { UNCONFIGURED_MSG } from '../config.js';

function requireClient(getClient: () => NamecheapClient | null): NamecheapClient {
  const c = getClient();
  if (!c) throw new Error(UNCONFIGURED_MSG);
  return c;
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
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
          recordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'URL', 'URL301', 'FRAME'])
            .describe('DNS record type'),
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
