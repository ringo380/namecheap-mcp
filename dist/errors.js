import { NamecheapApiError } from './types.js';
import { AUTH_CODES } from './client.js';
import { setAuthState } from './state.js';
// Convert any thrown error into a structured CallToolResult.
// Also updates module-scoped auth state when an auth-class error surfaces
// so /mcp auth_status reflects the most recent failure without a full reboot.
export function toErrorResult(err) {
    const message = err instanceof Error ? err.message : String(err);
    const isUnconfigured = message.includes('namecheap-mcp is not configured');
    if (err instanceof NamecheapApiError) {
        const isAuth = AUTH_CODES.has(err.code);
        if (isAuth) {
            setAuthState({
                ok: false,
                code: err.code,
                message: err.message,
                checkedAt: Date.now(),
            });
        }
        return {
            content: [{ type: 'text', text: `Error [${err.code}]: ${err.message}` }],
            structuredContent: {
                errorCode: err.code,
                command: err.command,
                isAuthError: isAuth,
                isUnconfigured: false,
            },
            isError: true,
        };
    }
    return {
        content: [{ type: 'text', text: isUnconfigured ? message : `Error: ${message}` }],
        structuredContent: {
            errorCode: isUnconfigured ? 'UNCONFIGURED' : 'UNKNOWN',
            isAuthError: isUnconfigured,
            isUnconfigured,
        },
        isError: true,
    };
}
//# sourceMappingURL=errors.js.map