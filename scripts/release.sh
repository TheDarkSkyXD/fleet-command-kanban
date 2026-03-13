#!/usr/bin/env bash
set -euo pipefail

# Release script: bumps version, commits, tags, pushes, and waits for CI to build & publish the release.
# Usage: ./scripts/release.sh <patch|minor|major> [--dry-run]

REPO="TheDarkSkyXD/fleet-command-kanban"
DRY_RUN=false

# --- Parse args ---
BUMP_TYPE="${1:-}"
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Usage: ./scripts/release.sh <patch|minor|major> [--dry-run]"
  echo "  patch  - 4.5.2 -> 4.5.3"
  echo "  minor  - 4.5.2 -> 4.6.0"
  echo "  major  - 4.5.2 -> 5.0.0"
  exit 1
fi

if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# --- Ensure on main branch ---
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: Must be on main branch (currently on '$BRANCH')."
  exit 1
fi

# --- Read current version ---
CURRENT_VERSION="$(node -p "require('./package.json').version")"
IFS='.' read -r VMAJOR VMINOR VPATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  patch) VPATCH=$((VPATCH + 1)) ;;
  minor) VMINOR=$((VMINOR + 1)); VPATCH=0 ;;
  major) VMAJOR=$((VMAJOR + 1)); VMINOR=0; VPATCH=0 ;;
esac

NEW_VERSION="${VMAJOR}.${VMINOR}.${VPATCH}"
TAG="v${NEW_VERSION}"

echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION ($BUMP_TYPE)"

if $DRY_RUN; then
  echo "[dry-run] Would update package.json files, commit, tag $TAG, and push."
  exit 0
fi

# --- Commit any pending changes ---
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Staging and committing pending changes..."
  git add -A
  git commit -m "chore: pre-release changes for $NEW_VERSION"
  echo "Committed pending changes"
fi

# --- Bump version in all package.json files ---
PACKAGE_FILES=(
  "package.json"
  "apps/daemon/package.json"
  "apps/desktop/package.json"
  "apps/frontend/package.json"
  "packages/shared/package.json"
)

for file in "${PACKAGE_FILES[@]}"; do
  sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$file"
done

echo "Updated ${#PACKAGE_FILES[@]} package.json files"

# --- Commit and tag ---
git add "${PACKAGE_FILES[@]}"
git commit -m "chore: bump version to $NEW_VERSION"
git tag "$TAG"

echo "Created commit and tag $TAG"

# --- Push ---
git push origin main
git push origin "$TAG"

echo "Pushed to origin. GitHub Actions release workflow triggered."

# --- Wait for workflow ---
echo ""
echo "Waiting for release workflow to start..."
sleep 5

RUN_ID=""
for i in $(seq 1 12); do
  RUN_ID="$(gh run list --repo "$REPO" --workflow release.yml --branch "$TAG" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  if [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]]; then
    break
  fi
  echo "  Waiting for workflow to appear... (attempt $i/12)"
  sleep 5
done

if [[ -z "$RUN_ID" || "$RUN_ID" == "null" ]]; then
  echo "Warning: Could not find workflow run. Check manually at:"
  echo "  https://github.com/$REPO/actions/workflows/release.yml"
  exit 1
fi

echo "Workflow run started: https://github.com/$REPO/actions/runs/$RUN_ID"
echo "Waiting for build to complete (this may take several minutes)..."
echo ""

gh run watch "$RUN_ID" --repo "$REPO" --exit-status

echo ""
echo "Release $TAG published successfully!"
echo "  https://github.com/$REPO/releases/tag/$TAG"
