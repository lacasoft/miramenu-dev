#!/bin/sh
# Development and CI only: starts SeaweedFS as a single S3-compatible process (ADR-0030).
# Two buckets (ADR-0038): S3_BUCKET holds the optimized variants, which anonymous clients
# may read because media is served straight to the phone; S3_ORIGINALS_BUCKET holds the
# uploads, still with their EXIF, and only the API identity may read or write it. Browsers
# may call S3 only from the admin and PWA origins.
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
      "actions": [
        "Read:${S3_BUCKET}", "Write:${S3_BUCKET}", "List:${S3_BUCKET}",
        "Read:${S3_ORIGINALS_BUCKET}", "Write:${S3_ORIGINALS_BUCKET}", "List:${S3_ORIGINALS_BUCKET}"
      ]
    }
  ]
}
JSON

exec weed -logtostderr=true mini \
  -dir=/data \
  -ip=127.0.0.1 \
  -ip.bind=0.0.0.0 \
  -bucket="${S3_BUCKET},${S3_ORIGINALS_BUCKET}" \
  -s3.config="$config" \
  -s3.allowedOrigins="${S3_ALLOWED_ORIGINS}" \
  -master.telemetry=false
