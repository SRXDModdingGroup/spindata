#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "Usage: $0 <version>"
  echo "  version  e.g. 1.2.0 (without the 'v' prefix)"
  exit 1
}

[[ $# -eq 1 ]] || usage
VERSION="$1"
TAG="v${VERSION}"

# Validate version format
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "error: version must be x.y.z"; exit 1; }

cd "$REPO_ROOT"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --staged --quiet; then
  echo "error: uncommitted changes present, commit or stash them first"
  exit 1
fi

# Check gh is available
command -v gh >/dev/null 2>&1 || { echo "error: gh CLI not found"; exit 1; }

echo "==> Bumping version to $VERSION"

# Update mod/SpinDataRelay.csproj
sed -i "s|<Version>.*</Version>|<Version>${VERSION}</Version>|" mod/SpinDataRelay.csproj

# Update mod/Plugin.cs
sed -i "s|public const string Version = \".*\";|public const string Version = \"${VERSION}\";|" mod/Plugin.cs

echo "==> Building mod"
cd "$REPO_ROOT/mod"
dotnet build -c Release

DLL="$REPO_ROOT/mod/bin/Release/net472/SpinDataRelay.dll"
[[ -f "$DLL" ]] || { echo "error: DLL not found at $DLL"; exit 1; }

echo "==> Updating README"
cd "$REPO_ROOT"
DOWNLOAD_URL="https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/download/${TAG}/SpinDataRelay.dll"
python3 - <<EOF
import re

with open('README.md', 'r') as f:
    content = f.read()

block = '<!-- mod-download -->\n**Latest release:** [${TAG}](${DOWNLOAD_URL})\n<!-- /mod-download -->'
content = re.sub(r'<!-- mod-download -->.*?<!-- /mod-download -->', block, content, flags=re.DOTALL)

with open('README.md', 'w') as f:
    f.write(content)
EOF

echo "==> Committing and tagging"
git add mod/SpinDataRelay.csproj mod/Plugin.cs README.md
git commit -m "release: ${TAG}"
git tag "$TAG"

echo "==> Pushing"
git push origin main
git push origin "$TAG"

echo "==> Creating GitHub release"
gh release create "$TAG" "$DLL" \
  --title "$TAG" \
  --generate-notes

echo ""
echo "Done. Release ${TAG} is live."
