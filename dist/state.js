// Runtime state shared across the server: auth status & last error.
// Kept in its own module to avoid circular imports between index.ts,
// config.ts, tools/setup.ts, and tools/auth_status.ts.
let current = {
    ok: false,
    code: 'UNCONFIGURED',
    message: 'No credentials loaded yet.',
    checkedAt: Date.now(),
};
export function getAuthState() {
    return current;
}
export function setAuthState(next) {
    current = next;
}
//# sourceMappingURL=state.js.map