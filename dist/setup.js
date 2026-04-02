#!/usr/bin/env node
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import axios from 'axios';
import { USER_CONFIG_DIR, USER_CONFIG_PATH } from './config.js';
// ─── Helpers ────────────────────────────────────────────────────────────────
function createRl() {
    return readline.createInterface({ input: process.stdin, output: process.stderr });
}
async function prompt(rl, question, defaultVal) {
    const display = defaultVal ? `${question} [${defaultVal}]: ` : `${question}: `;
    return new Promise((resolve) => {
        rl.question(display, (answer) => {
            resolve(answer.trim() || defaultVal || '');
        });
    });
}
async function promptSecret(rl, question) {
    return new Promise((resolve) => {
        // Monkey-patch rl output to suppress echo while muted
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const iface = rl;
        const origWrite = iface.output.write.bind(iface.output);
        let muted = false;
        iface.output.write = (...args) => {
            if (muted) {
                // Fire callback if provided so readline internal bookkeeping still works
                const cb = args[2];
                if (typeof cb === 'function')
                    cb();
                return true;
            }
            return origWrite(...args);
        };
        process.stderr.write(`${question}: `);
        muted = true;
        rl.once('line', (val) => {
            muted = false;
            iface.output.write = origWrite;
            process.stderr.write('\n');
            resolve(val);
        });
    });
}
async function detectPublicIp() {
    try {
        const res = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        return res.data.ip ?? null;
    }
    catch {
        return null;
    }
}
function maskKey(key) {
    if (key.length <= 4)
        return '••••';
    return '••••' + key.slice(-4);
}
function sep() {
    process.stderr.write('─'.repeat(50) + '\n');
}
// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    sep();
    process.stderr.write('namecheap-mcp setup\n');
    sep();
    process.stderr.write(`Config will be saved to: ${USER_CONFIG_PATH}\n\n`);
    // Detect public IP
    process.stderr.write('Detecting your public IP address...\n');
    const detectedIp = await detectPublicIp();
    if (detectedIp) {
        process.stderr.write(`Detected: ${detectedIp}\n\n`);
    }
    else {
        process.stderr.write('Could not auto-detect IP — you will be prompted.\n\n');
    }
    const rl = createRl();
    try {
        // Collect credentials
        const apiUser = await prompt(rl, 'Namecheap API username');
        if (!apiUser) {
            process.stderr.write('Error: API username is required.\n');
            process.exit(1);
        }
        const apiKey = await promptSecret(rl, 'Namecheap API key');
        if (!apiKey) {
            process.stderr.write('Error: API key is required.\n');
            process.exit(1);
        }
        const clientIp = await prompt(rl, 'Whitelisted client IP', detectedIp ?? undefined);
        if (!clientIp) {
            process.stderr.write('Error: Client IP is required.\n');
            process.exit(1);
        }
        const usernameInput = await prompt(rl, 'Account username (leave blank if same as API username)');
        const username = usernameInput || apiUser;
        const sandboxInput = await prompt(rl, 'Use sandbox API? (y/N)', 'N');
        const sandbox = sandboxInput.toLowerCase() === 'y';
        // Summary
        process.stderr.write('\n');
        sep();
        process.stderr.write('Config to write:\n\n');
        process.stderr.write(`  NAMECHEAP_API_USER   = ${apiUser}\n`);
        process.stderr.write(`  NAMECHEAP_API_KEY    = ${maskKey(apiKey)}\n`);
        process.stderr.write(`  NAMECHEAP_CLIENT_IP  = ${clientIp}\n`);
        if (username !== apiUser) {
            process.stderr.write(`  NAMECHEAP_USERNAME   = ${username}\n`);
        }
        process.stderr.write(`  NAMECHEAP_SANDBOX    = ${sandbox}\n`);
        sep();
        const confirm = await prompt(rl, 'Write this config? [Y/n]', 'Y');
        if (confirm.toLowerCase() === 'n') {
            process.stderr.write('Aborted.\n');
            process.exit(0);
        }
        // Write config
        fs.mkdirSync(USER_CONFIG_DIR, { recursive: true });
        const lines = [
            `NAMECHEAP_API_USER=${apiUser}`,
            `NAMECHEAP_API_KEY=${apiKey}`,
            `NAMECHEAP_CLIENT_IP=${clientIp}`,
        ];
        if (username !== apiUser) {
            lines.push(`NAMECHEAP_USERNAME=${username}`);
        }
        lines.push(`NAMECHEAP_SANDBOX=${sandbox ? 'true' : 'false'}`);
        fs.writeFileSync(USER_CONFIG_PATH, lines.join('\n') + '\n', { mode: 0o600 });
        process.stderr.write(`\nConfig saved to ${USER_CONFIG_PATH}\n`);
        process.stderr.write('Permissions set to 600 (owner read/write only).\n\n');
        // Claude config snippet
        sep();
        process.stderr.write('Add to your Claude MCP config (no env vars needed):\n\n');
        process.stderr.write('  {\n');
        process.stderr.write('    "mcpServers": {\n');
        process.stderr.write('      "namecheap": {\n');
        process.stderr.write('        "command": "namecheap-mcp"\n');
        process.stderr.write('      }\n');
        process.stderr.write('    }\n');
        process.stderr.write('  }\n\n');
        process.stderr.write('Or via the Claude Code CLI:\n\n');
        process.stderr.write('  claude mcp add namecheap namecheap-mcp\n\n');
        sep();
        // Warn about local .env override
        if (fs.existsSync('.env')) {
            process.stderr.write('Note: A .env file exists in the current directory. ' +
                'Its values take precedence over the user config for matching variables.\n\n');
        }
    }
    finally {
        rl.close();
    }
}
main().catch((err) => {
    process.stderr.write(`\nSetup failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=setup.js.map