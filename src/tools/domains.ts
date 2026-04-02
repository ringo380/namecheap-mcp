import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NamecheapClient } from '../client.js';
import { requireClient } from '../config.js';

export function registerDomainTools(server: McpServer, getClient: () => NamecheapClient | null): void {

  server.registerTool(
    'check_domains',
    {
      description: 'Check availability of one or more domains. Pass a comma-separated list like "example.com,example.net". Returns available/unavailable status per domain.',
      inputSchema: { domains: z.string().describe('Comma-separated list of domain names to check, e.g. "example.com,example.net"') },
    },
    async ({ domains }) => {
      try {
        const result = await requireClient(getClient).execute('namecheap.domains.check', { DomainList: domains });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'list_domains',
    {
      description: 'List all domains in your Namecheap account. Supports pagination and search filtering.',
      inputSchema: {
        page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
        pageSize: z.number().int().min(1).max(100).optional().describe('Results per page, max 100 (default: 20)'),
        searchTerm: z.string().optional().describe('Filter domains by name substring'),
        listType: z.enum(['ALL', 'EXPIRING', 'EXPIRED']).optional().describe('Filter by domain status (default: ALL)'),
      },
    },
    async ({ page, pageSize, searchTerm, listType }) => {
      try {
        const client = requireClient(getClient);
        const params: Record<string, string | number> = {
          Page: page ?? 1,
          PageSize: pageSize ?? 20,
        };
        if (searchTerm) params['SearchTerm'] = searchTerm;
        if (listType) params['ListType'] = listType;
        const result = await client.execute('namecheap.domains.getList', params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_domain_info',
    {
      description: 'Get full details for a single domain: expiry date, auto-renew status, whois privacy, registrar lock, DNS settings.',
      inputSchema: { domainName: z.string().describe('The domain name, e.g. "example.com"') },
    },
    async ({ domainName }) => {
      try {
        const result = await requireClient(getClient).execute('namecheap.domains.getInfo', { DomainName: domainName });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'renew_domain',
    {
      description: 'Renew a domain for a specified number of years. Returns the new expiry date and transaction details.',
      inputSchema: {
        domainName: z.string().describe('The domain name to renew, e.g. "example.com"'),
        years: z.number().int().min(1).max(10).describe('Number of years to renew (1–10)'),
      },
    },
    async ({ domainName, years }) => {
      try {
        const result = await requireClient(getClient).execute('namecheap.domains.renew', {
          DomainName: domainName,
          Years: years,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_tld_list',
    {
      description:
        'Get supported TLDs available through Namecheap. Returns name, category, and registrability. ' +
        'Use `search` to filter by name substring and `registerable` to show only API-registerable TLDs.',
      inputSchema: {
        search: z.string().optional().describe('Filter TLDs by name substring, e.g. "ai" returns .ai, .cloudai, etc. (case-insensitive)'),
        registerable: z.boolean().optional().describe('When true, only return TLDs registerable via the API'),
      },
    },
    async ({ search, registerable }) => {
      try {
        const result = await requireClient(getClient).execute('namecheap.domains.getTldList', {});

        const tldList = (result as Record<string, Record<string, unknown>>)?.['Tlds']?.['Tld'];
        if (!Array.isArray(tldList)) {
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        type TldEntry = Record<string, string>;
        let filtered = tldList as TldEntry[];

        if (search) {
          const lower = search.toLowerCase();
          filtered = filtered.filter(t => String(t['@_Name'] ?? '').toLowerCase().includes(lower));
        }

        if (registerable) {
          filtered = filtered.filter(t => t['@_IsApiRegisterable'] === 'true');
        }

        const slim = filtered.map(t => ({
          name: t['@_Name'],
          subCategory: t['@_SubCategory'],
          registerable: t['@_IsApiRegisterable'],
          renewable: t['@_IsApiRenewable'],
          transferable: t['@_IsApiTransferable'],
        }));

        return { content: [{ type: 'text', text: JSON.stringify(slim, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}
