#!/usr/bin/env bash
set -euo pipefail

# Arguments
HEAD_REF="${1:-}"
if [[ -z "$HEAD_REF" ]]; then
  echo "Usage: $0 <pr-head-ref>"
  exit 1
fi

# Configure Git
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

MAX_ATTEMPTS=3
ATTEMPT=1

while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
  echo "Docs sync attempt $ATTEMPT/$MAX_ATTEMPTS"

  # Generate docs
  npm run docs:api
  git add docs/

  # Check for changes
  if git diff --staged --quiet; then
    echo "No doc changes to commit."
    exit 0
  fi

  # Commit
  git commit -m "docs: auto-update generated docs"

  # Attempt push
  if git push origin "HEAD:$HEAD_REF"; then
    echo "Docs sync push succeeded."
    exit 0
  fi

  echo "Push rejected; refreshing from remote branch and regenerating docs..."

  # CRITICAL: Fetch and reset to remote state to incorporate concurrent changes
  git fetch origin "$HEAD_REF"
  git reset --hard "origin/$HEAD_REF"

  ((ATTEMPT++))
done

echo "Docs sync failed after $MAX_ATTEMPTS attempts due to ongoing remote updates."
exit 1   