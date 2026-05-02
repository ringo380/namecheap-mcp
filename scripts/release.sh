#!/usr/bin/env bash
# Release driver for namecheap-mcp.
#
# Performs every step in one shot so partial releases (the v1.5.0 incident)
# cannot recur:
#   1. Verify versions agree across package.json + plugin.json + CHANGELOG
#   2. Verify working tree clean and on main
#   3. Tag + push tag (if not already pushed)
#   4. Create GitHub release (if not already created)
#   5. Bump marketplace pin in robworks-claude-code-plugins
#   6. Commit + push marketplace
#
# Usage:  scripts/release.sh             # uses version from package.json
#         scripts/release.sh v1.6.0      # asserts package.json matches
#         scripts/release.sh --dry-run

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKETPLACE_REPO="${MARKETPLACE_REPO:-$HOME/git/robworks-claude-code-plugins}"
DRY_RUN=0
EXPECTED_VERSION=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    v*)        EXPECTED_VERSION="$arg" ;;
    *)         echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

run() {
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY: $*"
  else
    echo "RUN: $*"
    "$@"
  fi
}

cd "$REPO_ROOT"

# ---- 1. Version agreement ----
PKG_VERSION=$(node -p "require('./package.json').version")
PLUGIN_VERSION=$(node -p "require('./.claude-plugin/plugin.json').version")
TAG="v$PKG_VERSION"

if [[ -n "$EXPECTED_VERSION" && "$EXPECTED_VERSION" != "$TAG" ]]; then
  echo "ERROR: arg $EXPECTED_VERSION does not match package.json $TAG" >&2
  exit 1
fi
if [[ "$PKG_VERSION" != "$PLUGIN_VERSION" ]]; then
  echo "ERROR: package.json ($PKG_VERSION) != plugin.json ($PLUGIN_VERSION)" >&2
  exit 1
fi
if ! grep -q "^## \[$PKG_VERSION\]" CHANGELOG.md; then
  echo "ERROR: CHANGELOG.md has no '## [$PKG_VERSION]' entry" >&2
  exit 1
fi
echo "✓ version agreement: $TAG"

# ---- 2. Working tree clean, on main ----
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: not on main (on $BRANCH)" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree dirty — commit or stash first" >&2
  git status --short >&2
  exit 1
fi
echo "✓ clean tree on main"

# ---- 3. Tag + push ----
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "✓ tag $TAG already exists locally"
else
  run git tag "$TAG"
fi
if git ls-remote --tags origin "$TAG" | grep -q "$TAG"; then
  echo "✓ tag $TAG already on origin"
else
  run git push origin "$TAG"
fi

# ---- 4. GitHub release ----
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "✓ GitHub release $TAG already exists"
else
  # Extract this version's CHANGELOG section
  NOTES=$(awk -v ver="[$PKG_VERSION]" '
    $0 ~ "^## " ver { found=1; next }
    found && /^## \[/  { exit }
    found             { print }
  ' CHANGELOG.md)
  if [[ -z "$NOTES" ]]; then
    echo "ERROR: failed to extract CHANGELOG section for $PKG_VERSION" >&2
    exit 1
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY: gh release create $TAG --title \"$TAG\" --notes <...>"
  else
    echo "RUN: gh release create $TAG"
    gh release create "$TAG" --title "$TAG" --notes "$NOTES"
  fi
fi

# ---- 5. npm publish ----
PKG_NAME=$(node -p "require('./package.json').name")
PUBLISHED=$(npm view "$PKG_NAME@$PKG_VERSION" version 2>/dev/null || true)
if [[ "$PUBLISHED" == "$PKG_VERSION" ]]; then
  echo "✓ npm $PKG_NAME@$PKG_VERSION already published"
else
  cd "$REPO_ROOT"
  run npm run build
  run npm test
  if [[ "$PKG_NAME" == @* ]]; then
    run npm publish --access public
  else
    run npm publish
  fi
fi

# ---- 6+7. Marketplace pin ----
if [[ ! -d "$MARKETPLACE_REPO" ]]; then
  echo "WARN: marketplace repo not found at $MARKETPLACE_REPO — skipping pin bump" >&2
  echo "      set MARKETPLACE_REPO=/path/to/robworks-claude-code-plugins to enable" >&2
  exit 0
fi

cd "$MARKETPLACE_REPO"
CURRENT_PIN=$(node -e '
  const m = require("./.claude-plugin/marketplace.json");
  const p = m.plugins.find(p => p.name === "namecheap-mcp");
  console.log(p ? p.source.ref : "");
')
if [[ -z "$CURRENT_PIN" ]]; then
  echo "ERROR: namecheap-mcp not found in marketplace.json" >&2
  exit 1
fi
if [[ "$CURRENT_PIN" == "$TAG" ]]; then
  echo "✓ marketplace already pinned at $TAG"
  exit 0
fi
echo "marketplace pin: $CURRENT_PIN → $TAG"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY: would update marketplace.json + README.md, commit, push"
  exit 0
fi

# Use python for safe in-place JSON edit
python3 - "$CURRENT_PIN" "$TAG" <<'PY'
import json, sys, pathlib
old, new = sys.argv[1], sys.argv[2]
p = pathlib.Path(".claude-plugin/marketplace.json")
data = json.loads(p.read_text())
for plugin in data["plugins"]:
    if plugin["name"] == "namecheap-mcp":
        plugin["source"]["ref"] = new
p.write_text(json.dumps(data, indent=2) + "\n")
PY

# README table — single line replace
sed -i.bak "s|releases/tag/$CURRENT_PIN|releases/tag/$TAG|g; s|\`$CURRENT_PIN\`|\`$TAG\`|g" README.md
rm -f README.md.bak

git add .claude-plugin/marketplace.json README.md
git commit -m "bump namecheap-mcp pin $CURRENT_PIN → $TAG"
git push

echo ""
echo "✅ release $TAG complete"
echo "   - tag pushed"
echo "   - GitHub release created"
echo "   - marketplace pinned"
