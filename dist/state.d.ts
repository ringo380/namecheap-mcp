export type AuthState = {
    ok: true;
    validatedAt: number;
} | {
    ok: false;
    code: string;
    message: string;
    checkedAt: number;
} | {
    ok: false;
    code: 'UNCONFIGURED';
    message: string;
    checkedAt: number;
};
export declare function getAuthState(): AuthState;
export declare function setAuthState(next: AuthState): void;
