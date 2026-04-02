export interface NamecheapConfig {
    apiUser: string;
    apiKey: string;
    userName: string;
    clientIp: string;
    sandbox: boolean;
}
export interface HostRecord {
    hostName: string;
    recordType: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'URL' | 'URL301' | 'FRAME';
    address: string;
    mxPref?: number;
    ttl?: number;
}
export interface EmailForward {
    mailbox: string;
    forwardTo: string;
}
export declare class NamecheapApiError extends Error {
    readonly code: string;
    readonly command: string;
    constructor(message: string, code: string, command: string);
}
