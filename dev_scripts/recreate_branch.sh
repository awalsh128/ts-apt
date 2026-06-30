#!/bin/bash -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
# shellcheck disable=SC1090
source "${SCRIPT_DIR}/lib.sh"

source_branch="main"
target_branch="${1}"  # replaced

usage_msg=$(usage "${0}" "<target branch to recreate>")
validate_arg "${target_branch}" "Target branch must be specified." "${usage_msg}"

confirm_prompt "Do you want to push the branch reset on '${target_branch}' from '${source_branch}'?"

local_repo_path=$(realpath ../../cache-apt-pkgs-action)

wd=$(pwd)

clone_repo_and_cd "${source_branch}"
git branch -a

git branch "${target_branch}"
git branch --delete "${target_branch}"
git push origin --delete "${target_branch}"

git branch "${target_branch}"
git push origin "${target_branch}"

rebase_local_repo_from_head "${local_repo_path}"
cd "${wd}"
