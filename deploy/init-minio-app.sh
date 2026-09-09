#!/bin/sh
set -eu
umask 077

# Keep identifiers safe for the policy JSON below.
case "$S3_BUCKET" in
  ''|*[!a-z0-9.-]*) echo 'Invalid S3_BUCKET' >&2; exit 1 ;;
esac
if [ "$S3_ACCESS_KEY_ID" = "$MINIO_ROOT_USER" ]; then
  echo 'S3_ACCESS_KEY_ID must differ from MINIO_ROOT_USER' >&2
  exit 1
fi
case "$S3_SECRET_ACCESS_KEY" in
  ''|*__REPLACE_*) echo 'Replace the S3 secret before initialization' >&2; exit 1 ;;
esac

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
cat > /tmp/vo1d-blog-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetBucketLocation", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET/*"]
    }
  ]
}
EOF
mc admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc admin policy create local vo1d-blog-storage /tmp/vo1d-blog-policy.json >/dev/null
mc admin policy attach local vo1d-blog-storage --user "$S3_ACCESS_KEY_ID" >/dev/null
echo 'MinIO application user and bucket policy are ready.'
