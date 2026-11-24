#!/bin/sh
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 EUROPESIP
# ÓRBITA · after-push script of the scriptapps Job (hcl-dx-scriptapp 0.2.0). Runs in the DXClient container (/dxclient),
# after the push of the Script Applications (APP_IDS_FILE: "name<TAB>content ID" lines). Since 4.0.0 (issue #28) the
# whole portal part is one step: sitio.mjs (theme, WCM libraries, site or pages, access). Idempotent: it only adds or
# updates, never deletes.
set -eu
D=$(dirname "$0")
node "$D/sitio.mjs" "$D"
