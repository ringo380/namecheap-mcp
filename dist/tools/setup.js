import * as fs from 'node:fs';
import { NamecheapClient } from '../client.js';
import { USER_CONFIG_DIR, USER_CONFIG_PATH, detectPublicIp, escapeEnvValue } from '../config.js';
export function registerSetupTool(server, getClient, setClient) {
    server.registerTool('setup', {
        description: 'Configure namecheap-mcp with your Namecheap API credentials. ' +
            'Credentials are saved to ~/.config/namecheap-mcp/.env on your local machine. ' +
            'Run this if other tools report that the server is not configured.',
        inputSchema: {},
    }, async () => {
        // Check elicitation support
        const caps = server.server.getClientCapabilities();
        if (!caps?.elicitation) {
            return {
                content: [{
                        type: 'text',
                        text: 'Your MCP client does not support interactive elicitation.\n\n' +
                            'Run `namecheap-mcp-setup` in your terminal to configure credentials interactively, ' +
                            'or set the following environment variables in your MCP server config:\n\n' +
                            '  NAMECHEAP_API_USER   — your Namecheap username\n' +
                            '  NAMECHEAP_API_KEY    — your API key (Account > Profile > Tools > API Access)\n' +
                            '  NAMECHEAP_CLIENT_IP  — your whitelisted public IP address\n' +
                            '  NAMECHEAP_SANDBOX    — "true" to use the sandbox API (optional)',
                    }],
            };
        }
        const isConfigured = getClient() !== null;
        const detectedIp = await detectPublicIp();
        let result;
        try {
            result = await server.server.elicitInput({
                mode: 'form',
                message: 'Enter your Namecheap API credentials. ' +
                    'These are stored locally in ~/.config/namecheap-mcp/.env and are not sent to any AI service.' +
                    (isConfigured ? '\n\nA configuration already exists — submitting will overwrite it.' : ''),
                requestedSchema: {
                    type: 'object',
                    properties: {
                        apiUser: {
                            type: 'string',
                            title: 'API Username',
                            description: 'Your Namecheap username (same as your account login)',
                            minLength: 1,
                        },
                        apiKey: {
                            type: 'string',
                            title: 'API Key',
                            description: 'Found at: Account > Profile > Tools > API Access',
                            minLength: 1,
                        },
                        clientIp: {
                            type: 'string',
                            title: 'Whitelisted Client IP',
                            description: 'Your public IP — must be whitelisted in the Namecheap dashboard',
                            ...(detectedIp ? { default: detectedIp } : {}),
                            minLength: 1,
                        },
                        userName: {
                            type: 'string',
                            title: 'Account Username (optional)',
                            description: 'Leave blank if the same as API Username (most users can ignore this)',
                        },
                        sandbox: {
                            type: 'boolean',
                            title: 'Use Sandbox API',
                            description: 'Enable for testing (uses api.sandbox.namecheap.com)',
                            default: false,
                        },
                    },
                    required: ['apiUser', 'apiKey', 'clientIp'],
                },
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const isTimeout = msg.includes('-32001') || msg.toLowerCase().includes('timed out');
            return {
                content: [{
                        type: 'text',
                        text: isTimeout
                            ? 'Setup timed out — the form must be submitted before the request expires. Call `setup` again and submit the form promptly.'
                            : `Setup failed: ${msg}`,
                    }],
                isError: true,
            };
        }
        if (result.action !== 'accept' || !result.content) {
            return { content: [{ type: 'text', text: 'Setup cancelled.' }] };
        }
        const apiUser = String(result.content['apiUser'] ?? '');
        const apiKey = String(result.content['apiKey'] ?? '');
        const clientIp = String(result.content['clientIp'] ?? '');
        const userNameInput = String(result.content['userName'] ?? '').trim();
        const userName = userNameInput || apiUser;
        const sandbox = result.content['sandbox'] === true;
        if (!apiUser || !apiKey || !clientIp) {
            return {
                content: [{ type: 'text', text: 'Setup failed: API username, API key, and client IP are all required.' }],
                isError: true,
            };
        }
        // Write config file with owner-only permissions; quote all values for safety
        fs.mkdirSync(USER_CONFIG_DIR, { recursive: true });
        const lines = [
            `NAMECHEAP_API_USER=${escapeEnvValue(apiUser)}`,
            `NAMECHEAP_API_KEY=${escapeEnvValue(apiKey)}`,
            `NAMECHEAP_CLIENT_IP=${escapeEnvValue(clientIp)}`,
            `NAMECHEAP_SANDBOX=${sandbox ? 'true' : 'false'}`,
        ];
        if (userName !== apiUser) {
            lines.splice(3, 0, `NAMECHEAP_USERNAME=${escapeEnvValue(userName)}`);
        }
        fs.writeFileSync(USER_CONFIG_PATH, lines.join('\n') + '\n', { mode: 0o600 });
        // Update process.env so the live client reflects the new values
        process.env['NAMECHEAP_API_USER'] = apiUser;
        process.env['NAMECHEAP_API_KEY'] = apiKey;
        process.env['NAMECHEAP_CLIENT_IP'] = clientIp;
        process.env['NAMECHEAP_USERNAME'] = userName;
        process.env['NAMECHEAP_SANDBOX'] = sandbox ? 'true' : 'false';
        // Validate credentials before activating the client
        try {
            await new NamecheapClient({ apiUser, apiKey, userName, clientIp, sandbox })
                .execute('namecheap.users.getBalances', {});
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                content: [{
                        type: 'text',
                        text: `Credentials saved to ${USER_CONFIG_PATH}, but validation failed: ${msg}\n\n` +
                            `Fix the issue and call \`setup\` again, or verify your API key and whitelisted IP at ap.www.namecheap.com/settings/tools/apiaccess/`,
                    }],
                isError: true,
            };
        }
        // Activate the new client immediately — no server restart needed
        setClient(new NamecheapClient({ apiUser, apiKey, userName, clientIp, sandbox }));
        return {
            content: [{
                    type: 'text',
                    text: `Setup complete! Credentials saved to ${USER_CONFIG_PATH}\n\n` +
                        `Call \`get_balances\` to verify the connection.`,
                }],
        };
    });
}
//# sourceMappingURL=setup.js.map