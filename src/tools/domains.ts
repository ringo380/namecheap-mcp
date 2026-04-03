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
        const raw = (result as Record<string, unknown>)?.['DomainCheckResult'];
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        type RawCheck = Record<string, string>;
        const clean = (list as RawCheck[]).map(d => {
          const isPremium = d['@_IsPremiumName'] === 'true';
          const entry: Record<string, unknown> = {
            domain: d['@_Domain'],
            available: d['@_Available'] === 'true',
            isPremium,
          };
          if (isPremium) entry['premiumPrice'] = parseFloat(d['@_PremiumRegistrationPrice'] ?? '0');
          return entry;
        });
        return { content: [{ type: 'text', text: JSON.stringify(clean, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'list_domains',
    {
      description: 'List all domains in your Namecheap account. Supports pagination and search filtering. Call with increasing page values until hasNextPage is false to retrieve all domains.',
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
        const currentPage = page ?? 1;
        const currentPageSize = pageSize ?? 20;
        const params: Record<string, string | number> = {
          Page: currentPage,
          PageSize: currentPageSize,
        };
        if (searchTerm) params['SearchTerm'] = searchTerm;
        if (listType) params['ListType'] = listType;
        const result = await client.execute('namecheap.domains.getList', params);
        const r = result as Record<string, unknown>;
        const raw = r?.['DomainGetListResult'] as Record<string, unknown> | undefined;
        const paging = r?.['Paging'] as Record<string, string> | undefined;

        const domainList = raw?.['Domain'];
        const list = Array.isArray(domainList) ? domainList : domainList ? [domainList] : [];
        type RawDomain = Record<string, string>;
        const domainsMapped = (list as RawDomain[]).map(d => ({
          id: d['@_ID'],
          name: d['@_Name'],
          created: d['@_Created'],
          expires: d['@_Expires'],
          expired: d['@_IsExpired'] === 'true',
          locked: d['@_IsLocked'] === 'true',
          autoRenew: d['@_AutoRenew'] === 'true',
          whoisGuard: d['@_WhoisGuard'],
          usingNamecheapDns: d['@_IsOurDNS'] === 'true',
        }));

        const totalItems = parseInt(paging?.['TotalItems'] ?? '0', 10);
        const totalPages = Math.ceil(totalItems / currentPageSize);
        const clean = {
          domains: domainsMapped,
          pagination: {
            page: currentPage,
            pageSize: currentPageSize,
            totalItems,
            totalPages,
            hasNextPage: currentPage < totalPages,
          },
        };
        return { content: [{ type: 'text', text: JSON.stringify(clean, null, 2) }] };
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
        const r = (result as Record<string, unknown>)?.['DomainGetInfoResult'] as Record<string, unknown> | undefined;
        if (!r) return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

        const wg = r['Whoisguard'] as Record<string, string> | undefined;
        const dns = r['DnsDetails'] as Record<string, unknown> | undefined;
        const nameservers = dns?.['Nameserver'];
        const nsList = Array.isArray(nameservers) ? nameservers : nameservers ? [nameservers] : [];

        const clean: Record<string, unknown> = {
          domain: r['@_DomainName'],
          status: r['@_Status'],
          id: r['@_ID'],
          owner: r['@_OwnerName'],
          created: (r['DomainDetails'] as Record<string, string> | undefined)?.['CreatedDate'],
          expires: (r['DomainDetails'] as Record<string, string> | undefined)?.['ExpiredDate'],
          expired: r['@_IsExpired'] === 'true',
          locked: r['@_IsLocked'] === 'true',
          autoRenew: r['@_AutoRenew'] === 'true',
          whoisGuard: wg ? {
            enabled: wg['@_Enabled'] === 'true',
            id: wg['@_ID'],
            expires: wg['@_ExpiredDate'],
          } : null,
          dns: {
            type: dns?.['@_ProviderType'],
            nameservers: nsList,
          },
        };
        return { content: [{ type: 'text', text: JSON.stringify(clean, null, 2) }] };
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

  server.registerTool(
    'set_domain_autorenew',
    {
      description: 'Enable or disable auto-renewal for a domain.',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        autoRenew: z.boolean().describe('true to enable auto-renewal, false to disable'),
      },
    },
    async ({ domainName, autoRenew }) => {
      try {
        await requireClient(getClient).execute('namecheap.domains.autoRenew', {
          DomainName: domainName,
          flag: autoRenew ? 'true' : 'false',
        });
        return { content: [{ type: 'text', text: JSON.stringify({ domain: domainName, autoRenew }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'set_whoisguard',
    {
      description: 'Enable or disable WHOIS guard (privacy protection) for a domain. WHOIS guard must already be purchased/allocated to the domain.',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        enable: z.boolean().describe('true to enable WHOIS guard, false to disable'),
      },
    },
    async ({ domainName, enable }) => {
      try {
        const client = requireClient(getClient);
        const info = await client.execute('namecheap.domains.getInfo', { DomainName: domainName });
        const wg = ((info as Record<string, unknown>)?.['DomainGetInfoResult'] as Record<string, unknown> | undefined)?.['Whoisguard'] as Record<string, string> | undefined;

        if (!wg || wg['@_Enabled'] === 'NOTPRESENT') {
          return {
            content: [{ type: 'text', text: `No WHOIS guard subscription found for ${domainName}. Purchase WHOIS guard first.` }],
            isError: true,
          };
        }

        const whoisguardId = wg['@_ID'];
        const command = enable ? 'namecheap.whoisguard.enable' : 'namecheap.whoisguard.disable';
        await client.execute(command, { WhoisguardId: whoisguardId });
        return { content: [{ type: 'text', text: JSON.stringify({ domain: domainName, whoisGuard: enable ? 'ENABLED' : 'DISABLED' }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'set_registrar_lock',
    {
      description: 'Lock or unlock the registrar lock (transfer lock) for a domain. A locked domain cannot be transferred to another registrar.',
      inputSchema: {
        domainName: z.string().describe('The domain name, e.g. "example.com"'),
        locked: z.boolean().describe('true to lock the domain, false to unlock'),
      },
    },
    async ({ domainName, locked }) => {
      try {
        await requireClient(getClient).execute('namecheap.domains.setRegistrarLock', {
          DomainName: domainName,
          LockAction: locked ? 'LOCK' : 'UNLOCK',
        });
        return { content: [{ type: 'text', text: JSON.stringify({ domain: domainName, locked }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}
