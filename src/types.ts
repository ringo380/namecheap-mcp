export interface NamecheapConfig {
  apiUser: string;
  apiKey: string;
  userName: string;
  clientIp: string;
  sandbox: boolean;
}

export type RecordType =
  | 'A'
  | 'AAAA'
  | 'ALIAS'
  | 'CAA'
  | 'CNAME'
  | 'FRAME'
  | 'MX'
  | 'MXE'
  | 'NS'
  | 'TXT'
  | 'URL'
  | 'URL301';

export interface HostRecord {
  hostName: string;
  recordType: RecordType | string;
  address: string;
  mxPref?: number;
  ttl?: number;
}

export interface EmailForward {
  mailbox: string;
  forwardTo: string;
}

export class NamecheapApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly command: string
  ) {
    super(message);
    this.name = 'NamecheapApiError';
  }
}
