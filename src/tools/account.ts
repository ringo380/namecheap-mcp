import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NamecheapClient } from '../client.js';
import { UNCONFIGURED_MSG } from '../config.js';

function requireClient(getClient: () => NamecheapClient | null): NamecheapClient {
  const c = getClient();
  if (!c) throw new Error(UNCONFIGURED_MSG);
  return c;
}

export function registerAccountTools(server: McpServer, getClient: () => NamecheapClient | null): void {

  server.registerTool(
    'get_balances',
    {
      description: 'Get your Namecheap account balance: available funds, total balance, earned amount, and withdrawable amount.',
      inputSchema: {},
    },
    async () => {
      try {
        const result = await requireClient(getClient).execute('namecheap.users.getBalances', {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  server.registerTool(
    'get_pricing',
    {
      description: 'Get pricing information for Namecheap products. Use productType "DOMAIN" to check domain registration and renewal costs.',
      inputSchema: {
        productType: z.enum(['DOMAIN', 'SSLCERTIFICATE', 'WHOISGUARD'])
          .describe('Product category to get pricing for'),
        productCategory: z.string().optional()
          .describe('Specific product category, e.g. "REGISTER", "RENEW", "TRANSFER" for domains'),
        actionName: z.string().optional()
          .describe('Action name filter, e.g. "REGISTER"'),
        productName: z.string().optional()
          .describe('Specific product name filter, e.g. a TLD like "com" or "net"'),
        promotionCode: z.string().optional()
          .describe('Promotional code to get discounted pricing'),
      },
    },
    async ({ productType, productCategory, actionName, productName, promotionCode }) => {
      try {
        const params: Record<string, string | number> = { ProductType: productType };
        if (productCategory) params['ProductCategory'] = productCategory;
        if (actionName) params['ActionName'] = actionName;
        if (productName) params['ProductName'] = productName;
        if (promotionCode) params['PromotionCode'] = promotionCode;
        const result = await requireClient(getClient).execute('namecheap.users.getPricing', params);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}
