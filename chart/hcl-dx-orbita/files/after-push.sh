#!/bin/sh
# ÓRBITA · after-push script of the scriptapps Job (hcl-dx-scriptapp 0.2.0): one DX page per application, with a Web
# Content Viewer showing its Script Application, via XMLAccess. Runs in the DXClient container (/dxclient), with
# DXClient already configured by the push. Idempotent: it creates or updates the same pages (unique names orbita.*).
set -eu
D=$(dirname "$0")
node "$D/paginas.mjs" "$D/paginas.json" "$APP_IDS_FILE" > /tmp/paginas.xml
if [ ! -s /tmp/paginas.xml ]; then
  echo "pages: not created (pages.create=false)"
  exit 0
fi
rc=0
./bin/dxclient xmlaccess --xmlFile /tmp/paginas.xml --xmlAccessOutputFileName orbita-paginas.xml > /tmp/xmlaccess.log 2>&1 || rc=$?
cat /tmp/xmlaccess.log
OUT=store/outputFiles/xmlaccess/orbita-paginas.xml
if [ "$rc" -ne 0 ] || ! grep -q '<status element="all" result="ok"/>' "$OUT" 2>/dev/null; then
  [ -f "$OUT" ] && grep -i -A3 'result="fail"\|<message' "$OUT" | head -20
  echo "ERROR: XMLAccess did not create the pages (exit $rc)"
  exit 1
fi
node -e 'const p = require(process.argv[1]); console.log("pages: " + p.titles.map(t => p.base + t.friendly).join(" "))' "$D/paginas.json"
