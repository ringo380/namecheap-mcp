// Runtime state shared across the server: auth status & last error.
// Kept in its own module to avoid circular imports between index.ts,
// config.ts, tools/setup.ts, and tools/auth_status.ts.

export type AuthState =
  | { ok: true; validatedAt: number }
  | { ok: false; code: string; message: string; checkedAt: number }
  | { ok: false; code: 'UNCONFIGURED'; message: string; checkedAt: number };

let current: AuthState = {
  ok: false,
  code: 'UNCONFIGURED',
  message: 'No credentials loaded yet.',
  checkedAt: Date.now(),
};

export function getAuthState(): AuthState {
  return current;
}

export function setAuthState(next: AuthState): void {
  current = next;
}
