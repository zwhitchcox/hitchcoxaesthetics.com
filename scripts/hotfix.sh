#!/bin/bash

# DO NOT USE UNLESS YOU KNOW WHAT YOU'RE DOING
id=$(fly m list --json | jq -r '.[0].id')
name=$(fly status --json | jq -r '.Name')

dest=/data/hotfix
pnpm build
fly ssh console -C "mkdir -p $dest"

rsync -rplitz -e $PWD/scripts/ssh-q \
  $PWD/build/ \
  $id.vm.$name.internal:$dest/build --delete

rsync -rplitz -e $PWD/scripts/ssh-q \
  $PWD/server-build/ \
  $id.vm.$name.internal:$dest/server-build --delete

pid=$(fly ssh console --address $id.vm.$name.internal -C "bash -c 'ps aux | grep \"sh -c cross-env\" | head -n 1 | awk \"{print \\\$2}\"'")
fly ssh console --address $id.vm.$name.internal -C "kill -9 $pid"
