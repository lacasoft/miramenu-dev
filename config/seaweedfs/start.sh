#!/bin/sh
# Development and CI only: starts SeaweedFS as a single S3-compatible process (ADR-0030).
# The API identity can read and write the media bucket; anonymous clients can only read
# it, because media is served straight to the phone and never through the API.
set -eu

config=/tmp/s3.json
umask 077
cat > "$config" <<JSON
{
  "identities": [
    { "name": "anonymous", "actions": ["Read:${S3_BUCKET}"] },
    {
      "name": "miramenu_api",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }],
      "actions": ["Read:${S3_BUCKET}", "Write:${S3_BUCKET}", "List:${S3_BUCKET}"]
    }
  ]
}
JSON

exec weed -logtostderr=true mini \
  -dir=/data \
  -ip=127.0.0.1 \
  -ip.bind=0.0.0.0 \
  -bucket="${S3_BUCKET}" \
  -s3.config="$config" \
  -master.telemetry=false
