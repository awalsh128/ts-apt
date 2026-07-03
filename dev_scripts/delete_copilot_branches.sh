#!/bin/bash

git branch -r | grep 'origin/copilot' | sed 's/origin\///' | xargs -n 1 git push origin --delete