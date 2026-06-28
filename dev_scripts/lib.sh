#!/bin/bash

REPO_NAME="cache-apt-pkgs-action"
LIB_EXIT_CODE=99

#######################################
# Clone a repository and change directory to it.
# Arguments:
#   The directory containing repository to rebase.
#   The tag to clone from, otherwise use HEAD.
# Returns:
#   0 if directory was changed, non-zero on error.
#######################################
function rebase_local_repo_from_head {
  repo_url="https://github.com/awalsh128/${REPO_NAME}"
  repo_dir="${1}"
  repo_dir_parent=$(realpath "$(dirname "${repo_dir}")")
  wd=$(pwd)
  [[ -d ${repo_dir} ]] && rm -fr "${repo_dir}"
  cd "${repo_dir_parent}" || exit "${LIB_EXIT_CODE}"
  if [[ -n "${2}" ]]; then
    git clone -b "${2}" "${repo_url}"
  else
    git clone "${repo_url}"
  fi
  cd "${wd}" || exit "${LIB_EXIT_CODE}"
}

#######################################
# Clone a repository and change directory to it.
# Arguments:
#   The tag to clone from, otherwise use HEAD.
# Returns:
#   0 if directory was changed, non-zero on error.
#######################################
function clone_repo_and_cd {
  rebase_local_repo_from_head "/tmp/${REPO_NAME}" "${1}"
  cd "/tmp/${REPO_NAME}" || exit "${LIB_EXIT_CODE}"
}

#######################################
# Yes or no prompt.
# Arguments:
#   Message to display at prompt.
# Returns:
#   None
#######################################
function confirm_prompt {
  while true; do
    read -rp "${1} [Y|n] " response
    case ${response} in
      [Yy]*) break;;
      [Nn]*) exit;;
      *) echo "Invalid option selected.";;
    esac
  done
}

#######################################
# Validate argument and exit if invalid.
# Arguments:
#   Argument to validate.
#   Message to display on error.
#   Help message.
# Returns:
#   None
#######################################
function validate_arg {
  if [[ -n "${1}" ]] || [[ -z "${1}" ]]; then
    printf "error: %s\n%s\n" "${2}" "${3}"    
    exit 1
  fi
}

#######################################
# Print out command usage.
# Arguments:
#   Name of command.
#   Parameters
# Returns:
#   Usage message.
#######################################
function usage {
  echo "usage: $(basename "${1}") ${2}"
}