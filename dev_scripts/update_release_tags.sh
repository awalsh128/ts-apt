#!/bin/bash -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
# shellcheck disable=SC1090
source "${SCRIPT_DIR}/lib.sh"

"${SCRIPT_DIR}/copy_tag.sh" "${1}" "v1"
"${SCRIPT_DIR}/copy_tag.sh" "${1}" "latest"

cd ..
for branch in dev staging master; do
  git switch "${branch}"
  git fetch origin --tags --force
done
