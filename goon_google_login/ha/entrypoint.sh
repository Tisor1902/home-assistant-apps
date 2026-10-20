#!/bin/sh
set -eu
umask 077
node /app/goon_google_login/ha/prepare.mjs
. /tmp/goon-login-environment.sh
rm -- /tmp/goon-login-environment.sh
unset FILE__PASSWORD SUPERVISOR_TOKEN HASSIO_TOKEN GH_TOKEN GITHUB_TOKEN
exec /init
