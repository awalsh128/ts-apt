#!/bin/bash

SCRIPT_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
ISSUE_ID="${1}"

BASE="main"
BRANCH_SUFFIX="issue-${ISSUE_ID}"
HOTFIX_BRANCH="hotfix/${BRANCH_SUFFIX}"

usage() {
  msg="$1"
  echo -e "error: ${msg}\n"
  echo "usage: hotfix.sh <issue ID> <target branch>"
  echo "  example: hotfix 123 main (create hotfix and patch into main)"
  exit 1
}

if [[ -z "${ISSUE_ID}" ]]; then
  usage "Issue ID is empty"
fi
if ! [[ "${ISSUE_ID}" =~ ^[0-9]+$ ]]; then  
  usage "Issue ID must be an integer."
fi

create_or_checkout_branch() {
  checkout_branch="$1"
  base_branch="$2"
  if git ls-remote --exit-code --heads origin "${checkout_branch}" > /dev/null 2>&1; then
    echo "Branch ${checkout_branch} exists. Checking out and merging ${base_branch}..."
    git checkout "${checkout_branch}"    # Checkout existing branch (keeps history)
    git pull origin "${checkout_branch}" # Ensure local is up to date
    git merge "${base_branch}"                # Merge hotfix into existing history
  else
    echo "Creating hotfix branch for issue ${ISSUE_ID}..."
    git checkout "${base_branch}"             # Create from main as baseline
    git checkout -b "${checkout_branch}" # Create new branch
    git merge "${base_branch}"                # Merge hotfix
  fi
}

# Go to root
cd "${SCRIPT_DIR}/.." || exit 3

create_or_checkout_branch "${HOTFIX_BRANCH}"

echo "Edit files and press 'y' to create/update PR or 'n' to abort..."
read -r -n 1 -s answer

if [[ "${answer}" == [nN] ]]; then
  echo "Exiting, you can always rerun to pickup where you left off."
  exit 0
fi

push_changes() {
  fix_type="${1}"
  sync_branch="${2}"
  sync_base="${3}"  
  msg="${fix_type}: resolve critical production issue in #${ISSUE_ID}"

  git add .
  git commit -m "${msg}"

  pr_url=$(gh pr list --head "${sync_branch}" --base "${sync_base}" --state open --json url --jq '.[].url')
  if [[ -n "${pr_url}" ]]; then
    echo "PR already exists: ${pr_url}"
  else
    echo "No PR found. Creating new PR..."
    gh pr create --head "${sync_branch}" --base "${sync_base}" --title "${msg}"
  fi

  echo "Pushing changes from ${sync_base} to ${sync_branch}..."
  git push origin "${sync_branch}"
}

push_changes "fix" "${HOTFIX_BRANCH}" "${BASE}"

sync_changes() {
  reason_prefix="${1}"
  for env in "staging" "dev"; do
    env_hotfix_branch="${reason_prefix}/${env}-${BRANCH_SUFFIX}"
    create_or_checkout_branch "${env_hotfix_branch}" "${HOTFIX_BRANCH}"
    push_changes "${reason_prefix}" "${env_hotfix_branch}" "${env}"
  done
}
