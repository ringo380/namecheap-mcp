import type { HostRecord, RecordType } from './types.js';
declare const MULTI_VALUE_TYPES: ReadonlySet<RecordType>;
export declare function recordMatches(existing: HostRecord, target: {
    hostName: string;
    recordType: string;
    address?: string;
}): boolean;
export { MULTI_VALUE_TYPES };
