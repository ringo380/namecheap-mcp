import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { NamecheapClient } from '../client.js';
import { requireClient } from '../config.js';

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
        const r = (result as Record<string, Record<string, string>>)?.['UserGetBalancesResult'] ?? {};
        const clean = {
          currency: r['@_Currency'] ?? '',
          availableBalance: parseFloat(r['@_AvailableBalance'] ?? '0'),
          accountBalance: parseFloat(r['@_AccountBalance'] ?? '0'),
          earnedAmount: parseFloat(r['@_EarnedAmount'] ?? '0'),
          withdrawableAmount: parseFloat(r['@_WithdrawableAmount'] ?? '0'),
          fundsRequiredForAutoRenew: parseFloat(r['@_FundsRequiredForAutoRenew'] ?? '0'),
        };
        return { content: [{ type: 'text', text: JSON.stringify(clean, null, 2) }] };
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
