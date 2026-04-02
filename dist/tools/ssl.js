import { z } from 'zod';
import { UNCONFIGURED_MSG } from '../config.js';
function requireClient(getClient) {
    const c = getClient();
    if (!c)
        throw new Error(UNCONFIGURED_MSG);
    return c;
}
export function registerSslTools(server, getClient) {
    server.registerTool('list_ssl_certs', {
        description: 'List SSL certificates in your Namecheap account, including status, expiry, and associated domain.',
        inputSchema: {
            page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
            pageSize: z.number().int().min(1).max(100).optional().describe('Results per page, max 100 (default: 20)'),
        },
    }, async ({ page, pageSize }) => {
        try {
            const result = await requireClient(getClient).execute('namecheap.ssl.getList', {
                Page: page ?? 1,
                PageSize: pageSize ?? 20,
            });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
        }
    });
    server.registerTool('create_ssl_cert', {
        description: 'Purchase a new SSL certificate. Common types: PositiveSSL, EssentialSSL, InstantSSL, PositiveSSL Wildcard, PremiumSSL Wildcard.',
        inputSchema: {
            type: z.string().describe('Certificate product type, e.g. "PositiveSSL", "PositiveSSL Wildcard"'),
            years: z.number().int().min(1).max(3).describe('Certificate validity in years (1–3)'),
        },
    }, async ({ type, years }) => {
        try {
            const result = await requireClient(getClient).execute('namecheap.ssl.create', { Type: type, Years: years });
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
        }
    });
}
//# sourceMappingURL=ssl.js.map