import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { USER_CONFIG_DIR } from './config.js';
export const SNAPSHOTS_DIR = path.join(USER_CONFIG_DIR, 'snapshots');
const SNAPSHOT_VERSION = 1;
const DEFAULT_RETENTION = 50;
function sanitizeForFilename(domain) {
    return domain.replace(/[^a-z0-9.-]/gi, '_');
}
function formatTimestamp(d) {
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return (`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`);
}
function ensureDir() {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true, mode: 0o700 });
}
/**
 * Atomically write a DNS snapshot to ~/.config/namecheap-mcp/snapshots/.
 * Returns the absolute path of the written file, or null on failure
 * (snapshots are best-effort — a failure must never block the calling tool).
 */
export function writeSnapshot(args) {
    try {
        ensureDir();
        const snapshot = {
            version: SNAPSHOT_VERSION,
            domain: args.domain,
            takenAt: new Date().toISOString(),
            writtenBy: args.writtenBy,
            emailType: args.emailType,
            usingNamecheapDns: args.usingNamecheapDns,
            hosts: args.hosts,
            rawResponse: args.rawResponse,
        };
        const safeDomain = sanitizeForFilename(args.domain);
        const ts = formatTimestamp(new Date(snapshot.takenAt));
        const rand = crypto.randomBytes(3).toString('hex');
        const finalPath = path.join(SNAPSHOTS_DIR, `${safeDomain}__${ts}-${rand}.json`);
        const tmpPath = finalPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
        fs.renameSync(tmpPath, finalPath);
        pruneSnapshots(args.domain, DEFAULT_RETENTION);
        return finalPath;
    }
    catch (err) {
        process.stderr.write(`[namecheap-mcp] snapshot write failed for ${args.domain}: ${err instanceof Error ? err.message : String(err)}\n`);
        return null;
    }
}
/**
 * List all snapshots for a domain, newest first.
 */
export function listSnapshots(domain) {
    try {
        if (!fs.existsSync(SNAPSHOTS_DIR))
            return [];
        const safeDomain = sanitizeForFilename(domain);
        const prefix = safeDomain + '__';
        const files = fs
            .readdirSync(SNAPSHOTS_DIR)
            .filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
        const infos = [];
        for (const filename of files) {
            const fullPath = path.join(SNAPSHOTS_DIR, filename);
            try {
                const snap = readSnapshot(fullPath);
                infos.push({
                    path: fullPath,
                    filename,
                    takenAt: snap.takenAt,
                    hostCount: snap.hosts.length,
                    writtenBy: snap.writtenBy,
                });
            }
            catch {
                // Skip unreadable snapshot files without aborting the listing.
            }
        }
        infos.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
        return infos;
    }
    catch {
        return [];
    }
}
/**
 * Read a single snapshot file. Throws on missing, malformed, or wrong-version content.
 */
export function readSnapshot(snapshotPath) {
    const raw = fs.readFileSync(snapshotPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.version !== SNAPSHOT_VERSION) {
        throw new Error(`Snapshot version ${parsed.version} not supported (expected ${SNAPSHOT_VERSION}): ${snapshotPath}`);
    }
    if (!Array.isArray(parsed.hosts)) {
        throw new Error(`Snapshot missing hosts array: ${snapshotPath}`);
    }
    return parsed;
}
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
export function pruneSnapshots(domain, keep = DEFAULT_RETENTION) {
    const lockDir = path.join(SNAPSHOTS_DIR, `.prune-${sanitizeForFilename(domain)}.lock`);
    const acquired = tryAcquireLock(lockDir);
    if (!acquired)
        return;
    try {
        const infos = listSnapshots(domain);
        if (infos.length <= keep)
            return;
        for (const info of infos.slice(keep)) {
            try {
                fs.unlinkSync(info.path);
            }
            catch {
                // ENOENT from another writer racing us, or a permissions blip — ignore.
            }
        }
    }
    catch {
        // defensive outer catch; listSnapshots already swallows its own errors.
    }
    finally {
        try {
            fs.rmdirSync(lockDir);
        }
        catch { /* already gone */ }
    }
}
// Acquire an advisory mkdir-lock. If the lock dir is stale (older than
// STALE_LOCK_MS — far longer than any real prune), reclaim it and try again.
const STALE_LOCK_MS = 60_000;
function tryAcquireLock(lockDir) {
    try {
        fs.mkdirSync(lockDir);
        return true;
    }
    catch {
        try {
            const age = Date.now() - fs.statSync(lockDir).mtimeMs;
            if (age > STALE_LOCK_MS) {
                fs.rmdirSync(lockDir);
                fs.mkdirSync(lockDir);
                return true;
            }
        }
        catch { /* lost the race; another writer holds a fresh lock */ }
        return false;
    }
}
//# sourceMappingURL=snapshots.js.map