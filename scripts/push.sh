#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BANNER="> **mirror** - primary repo is at [tangled.org/alpine.girlfag.club/spindata](https://tangled.org/alpine.girlfag.club/spindata)"

echo "==> pushing to tangled"
git push tangled main

echo "==> pushing to github with mirror notice"
git checkout -b _github-push
sed -i "s|^# spindata$|# spindata\n\n${BANNER}|" README.md
git add README.md
git commit -m "readme: add mirror notice [github only]"
git push origin _github-push:main --force
git checkout main
git branch -D _github-push

echo "==> done :3"
