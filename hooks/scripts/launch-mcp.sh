#!/bin/sh
# namecheap-mcp plugin launcher.
#
# Strategy:
#   1. Prefer a globally installed `namecheap-mcp` binary if present (fast, shared).
#   2. Fall back to running the bundled `dist/index.js` inside this plugin.
#      If `node_modules/` is missing (fresh plugin clone), run a one-time
#      `npm install --omit=dev` before launching.
#
# All diagnostics go to stderr so they do not corrupt the stdio JSON-RPC
# channel that the MCP host reads from stdout.

set -u

# CLAUDE_PLUGIN_ROOT is normally set by Claude Code when invoking plugin
# scripts. If missing (manual invocation, alt MCP host), infer it from this
# script's own location.
: "${CLAUDE_PLUGIN_ROOT:=$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)}"

# 1. Global binary on PATH — use it if available.
if command -v namecheap-mcp >/dev/null 2>&1; then
    exec namecheap-mcp "$@"
fi

# 2. Bundled dist/ — ensure deps, then run.
BUNDLED_ENTRY="${CLAUDE_PLUGIN_ROOT}/dist/index.js"

if [ ! -f "$BUNDLED_ENTRY" ]; then
    echo "[namecheap-mcp] dist/index.js not found at $BUNDLED_ENTRY" 1>&2
    echo "[namecheap-mcp] Plugin appears incomplete. Reinstall the plugin or run 'npm run build' in the plugin directory." 1>&2
    exit 127
fi

if [ ! -d "${CLAUDE_PLUGIN_ROOT}/node_modules" ]; then
    echo "[namecheap-mcp] First-run: installing production dependencies..." 1>&2
    (cd "$CLAUDE_PLUGIN_ROOT" && npm install --omit=dev --no-audit --no-fund --silent) 1>&2 || {
        echo "[namecheap-mcp] npm install failed. Ensure Node.js 18+ and npm are installed." 1>&2
        exit 1
    }
fi

if ! command -v node >/dev/null 2>&1; then
    echo "[namecheap-mcp] 'node' not found on PATH. Install Node.js 18+." 1>&2
    exit 127
fi

exec node "$BUNDLED_ENTRY" "$@"
