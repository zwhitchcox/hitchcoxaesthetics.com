
#!/bin/bash

# DO NOT USE UNLESS YOU KNOW WHAT YOU'RE DOING
id=$(fly m list --json | jq -r '.[0].id')
name=$(fly status --json | jq -r '.Name')

dest=/data/hotfix
fly ssh console -C "rm -rf $dest"

pid=$(fly ssh console --address $id.vm.$name.internal -C "bash -c 'ps aux | grep \"sh -c cross-env\" | head -n 1 | awk \"{print \\\$2}\"'")
fly ssh console --address $id.vm.$name.internal -C "kill -9 $pid"
