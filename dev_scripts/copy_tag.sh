#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# shellcheck disable=SC1090
source "${SCRIPT_DIR}/lib.sh"

usage_msg="$(usage "$0" "<source-tag> <target-tag> [repo-name]")"

validate_tag_name() {
  local tag="$1"
  if ! git check-ref-format --allow-onelevel "refs/tags/${tag}" >/dev/null 2>&1; then
    printf "error: Invalid tag name: %s\n" "${tag}"
    exit 1
  fi
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "${usage_msg}"
  exit 1
fi

source_tag="$1"
target_tag="$2"
repo_name="${3:-ts-apt}"

# lib.sh clone helpers consume REPO_NAME; keep this script configurable by repo name.
REPO_NAME="${repo_name}"

if [[ -z "${source_tag}" || -z "${target_tag}" ]]; then
  printf "error: Source and target tags must be non-empty.\n"
  echo "${usage_msg}"
  exit 1
fi

if [[ "${source_tag}" == "${target_tag}" ]]; then
  printf "error: Source and target tags must be different.\n"
  exit 1
fi

validate_tag_name "${source_tag}"
validate_tag_name "${target_tag}"

clone_repo_and_cd "${source_tag}"
git fetch origin --tags --prune >/dev/null 2>&1

if ! git show-ref --verify --quiet "refs/tags/${source_tag}"; then
  printf "error: Source tag '%s' does not exist in awalsh128/%s.\n" "${source_tag}" "${REPO_NAME}"
  exit 1
fi

source_oid="$(git rev-parse "refs/tags/${source_tag}")"
source_target_oid="$(git rev-parse "refs/tags/${source_tag}^{}")"

confirm_prompt "Update tag '${target_tag}' in awalsh128/${REPO_NAME} to match '${source_tag}'?"

# Set the exact same reference target as source tag.
git update-ref "refs/tags/${target_tag}" "${source_oid}"
git push --force origin "refs/tags/${target_tag}:refs/tags/${target_tag}"

printf "Updated tag '%s' to match '%s'.\n" "${target_tag}" "${source_tag}"
printf "Source ref object: %s\n" "${source_oid}"
printf "Resolved target commit/object: %s\n" "${source_target_oid}"
