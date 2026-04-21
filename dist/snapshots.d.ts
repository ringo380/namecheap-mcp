import type { HostRecord } from './types.js';
export declare const SNAPSHOTS_DIR: string;
export interface DnsSnapshot {
    version: number;
    domain: string;
    takenAt: string;
    writtenBy: string;
    emailType: string;
    usingNamecheapDns: boolean;
    hosts: HostRecord[];
    rawResponse: unknown;
}
export interface WriteSnapshotArgs {
    domain: string;
    writtenBy: string;
    emailType: string;
    usingNamecheapDns: boolean;
    hosts: HostRecord[];
    rawResponse: unknown;
}
/**
 * Atomically write a DNS snapshot to ~/.config/namecheap-mcp/snapshots/.
 * Returns the absolute path of the written file, or null on failure
 * (snapshots are best-effort — a failure must never block the calling tool).
 */
export declare function writeSnapshot(args: WriteSnapshotArgs): string | null;
export interface SnapshotInfo {
    path: string;
    filename: string;
    takenAt: string;
    hostCount: number;
    writtenBy: string;
}
/**
 * List all snapshots for a domain, newest first.
 */
export declare function listSnapshots(domain: string): SnapshotInfo[];
/**
 * Read a single snapshot file. Throws on missing, malformed, or wrong-version content.
 */
export declare function readSnapshot(snapshotPath: string): DnsSnapshot;
/**
 * Delete snapshots older than the most recent `keep` for a given domain.
 * Best-effort: errors are swallowed so pruning never blocks a write.
 *
 * Concurrency: uses an advisory mkdir-lock per domain so two overlapping
 * writes do not race on listSnapshots + unlink (which could over-delete or
 * leave the count above `keep`). If the lock is held by another process, we
 * skip — the next writer will catch up. Any unlink ENOENT is tolerated so a
 * pruning race with a concurrent restore/list cannot raise.
 */
export declare function pruneSnapshots(domain: string, keep?: number): void;
