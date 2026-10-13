#!/bin/bash
# git credential helper：回答時才從 github.env（600）讀 token
. /home/hatch/workspace/trader-leaderboard/github.env
echo "username=x-access-token"
echo "password=$GITHUB_PAT"
