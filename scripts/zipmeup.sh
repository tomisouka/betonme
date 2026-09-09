#!/bin/bash

zip -r betonme-backup.zip . \
  -x 'node_modules/*' \
  -x 'dist/*' \
  -x 'PACKED/*' \
  -x '__pycache__/*' \
  -x '.git/*' \
  -x '*.log' \
  -x '*sync-conflict*' \
  -x 'savedata-backups/*' \
  -x '*.zip'