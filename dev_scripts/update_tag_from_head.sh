#!/bin/bash -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
# shellcheck disable=SC1090
source "${SCRIPT_DIR}/lib.sh"

help_msg="${0} <source> <target>"

tag="${1}"
validate_arg "${tag}" "Tag arg must be non-empty." "${help_msg}"

commit_ver=$(git log --name-status HEAD^..HEAD | head -1 | awk '{print $2}')
commit_timestamp=$(git show -s --format=%ci "${commit_ver}")
confirm_prompt "Do you want to update tag '${tag}' with the latest commit at ${commit_timestamp}?"

clone_repo_and_cd
git push origin :refs/tags/"${tag}"
git tag -fa "${tag}"
git push origin master --tags

for t in $(git tag); do
  echo -e "${t}\t$(git show "${t}" | grep commit | awk '{print $2}')"
done

echo "Updated '${tag}' from HEAD @ ${commit_ver} ${commit_timestamp}."