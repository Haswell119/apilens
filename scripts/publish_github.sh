#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN=$(grep '^GITHUB_TOKEN=' /opt/data/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$TOKEN" ] || { echo "no GITHUB_TOKEN"; exit 1; }

USER=$(curl -s -H "Authorization: token $TOKEN" https://api.github.com/user | python3 -c "import sys,json;print(json.load(sys.stdin)['login'])")
echo "github user: $USER"

REPO="apilens"
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token $TOKEN" \
  -d "{\"name\":\"$REPO\",\"description\":\"APILens — open-source, ad-free JSON/JWT/API inspector Chrome extension\",\"public\":true,\"homepage\":\"https://meridian.digital\"}" \
  https://api.github.com/user/repos)
echo "repo create HTTP: $CODE (201=created, 422=already exists)"

if [ ! -d .git ]; then git init -q; fi
git add -A
git -c user.name="Meridian Digital" -c user.email="$USER@users.noreply.github.com" \
  commit -q -m "APILens v0.1.0 — open-source JSON/JWT/API inspector" --allow-empty || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:$TOKEN@github.com/$USER/$REPO.git"
git branch -M main
git push -u origin main --force 2>&1 | tail -20
echo "DONE: https://github.com/$USER/$REPO"
