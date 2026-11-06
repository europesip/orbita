#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Comprobaciones (solo lectura).
#  - suite-api: pod listo, /publico por el Ingress, login básico contra el LDAP y tablas en PostgreSQL.
#  - SSO: inicio de sesión en DX (j_security_check) y llamada a la API solo con la cookie LtpaToken2 del portal.
#  - Páginas: cada página pinta su Script Application y DX sirve suite.js intacto (WCM no ha quitado nada).
#  - Quiosco: solo con sesión (sin sesión no debe verse).
#  - MCP (9081): probe/ready, initialize, tools/list, una herramienta y la NetworkPolicy.
set -uo pipefail
source "$(dirname "$0")/config.sh"
set +e
H="https://$DX_HOST"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
J="$TMP/cookies"
errores=0
bien() { ok "$*"; }
mal()  { fail "$*"; errores=$((errores + 1)); }

info "suite-api ($SUITE_NS)"
listo=$(kubectl -n "$SUITE_NS" get deploy "$SUITE_APP" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
[[ "$listo" == 1 ]] && bien "Deployment $SUITE_APP listo" || mal "Deployment $SUITE_APP no está listo"
r=$(curl -sk -m 20 "$H$SUITE_PATH/publico")
[[ "$r" == *suite-api* ]] && bien "$H$SUITE_PATH/publico responde" || mal "$SUITE_PATH/publico no responde: $r"
r=$(curl -sk -m 120 -u "lucia.martin:$SUITE_USERS_PASSWORD" "$H$SUITE_PATH/api?op=yo")
[[ "$r" == *'"usuario":"lucia.martin"'* ]] && bien "lucia.martin entra con usuario y contraseña (LDAP)" || mal "Login básico: $r"
PRIMARY=$(kubectl -n "$SHARED_NS" get pod -l "cnpg.io/cluster=$PG_CLUSTER,cnpg.io/instanceRole=primary" -o name | head -1)
n=$(kubectl -n "$SHARED_NS" exec "$PRIMARY" -c postgres -- psql -U postgres -d "$SUITE_DB" -Atc \
  "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null)
[[ "$n" == 10 ]] && bien "10 tablas en $SUITE_DB (PostgreSQL $PG_CLUSTER)" || mal "Tablas en $SUITE_DB: ${n:-?} (esperadas 10)"

info "SSO con DX Compose"
curl -sk -m 60 -c "$J" -b "$J" -o /dev/null --data-urlencode "j_username=lucia.martin" \
  --data-urlencode "j_password=$SUITE_USERS_PASSWORD" "$H/wps/j_security_check"
grep -q LtpaToken2 "$J" && bien "lucia.martin inicia sesión en DX (cookie LtpaToken2)" || mal "No hay cookie LtpaToken2 tras el login en DX"
r=$(curl -sk -m 60 -b "$J" "$H$SUITE_PATH/api?op=yo")
[[ "$r" == *'"usuario":"lucia.martin"'* ]] && bien "La API reconoce la sesión del portal" || mal "SSO: $r"

info "Páginas y Script Applications"
for app in mi-intranet fichaje vacaciones gastos aprobaciones quiosco; do
  curl -sk -m 120 -L -b "$J" -c "$J" "$H${SUITE_PAGINAS}$app" -o "$TMP/p.html"
  if ! grep -q 'class="si-app"' "$TMP/p.html"; then mal "$app: la página no contiene la Script Application"; continue; fi
  u=$(grep -o -E 'src="[^"]*cmpntname=suite\.js[^"]*"' "$TMP/p.html" | head -1 | cut -d'"' -f2 | sed 's/&amp;/\&/g')
  curl -sk -m 60 -b "$J" "$H$u" -o "$TMP/s.js"
  cmp -s "$TMP/s.js" "$SALIDA/scriptapps/$app/suite.js" && bien "$app: página y suite.js correctos" \
    || mal "$app: DX sirve un suite.js distinto del construido (¿etiquetas WCM?)"
done
curl -sk -m 120 -L "$H/wps/portal/Home/quiosco" -o "$TMP/q.html"
grep -q 'class="si-app"' "$TMP/q.html" && mal "El quiosco se ve sin sesión (debería ser solo para autenticados)" \
  || bien "El quiosco no se ve sin sesión"

info "Servidor MCP (puerto 9081, solo dentro del clúster)"
kubectl -n "$SUITE_NS" port-forward "svc/$SUITE_APP" 9081:9081 >/dev/null 2>&1 &
PF=$!; trap 'kill $PF 2>/dev/null; rm -rf "$TMP"' EXIT
for _ in $(seq 1 10); do curl -s -m 2 -o /dev/null http://127.0.0.1:9081/probe/ready && break; sleep 1; done
M=http://127.0.0.1:9081/mcp
r=$(curl -s -m 20 http://127.0.0.1:9081/probe/ready)
[[ "$r" == ready ]] && bien "GET /probe/ready" || mal "GET /probe/ready: $r"
r=$(curl -s -m 20 -X POST "$M" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"99-verificar","version":"1"}}}')
[[ "$r" == *'"name":"orbita-mcp"'* ]] && bien "POST /mcp initialize" || mal "initialize: $r"
n=$(curl -s -m 20 -X POST "$M" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | grep -o '"inputSchema"' | wc -l)
((n > 0)) && bien "tools/list: $n herramienta(s)" || mal "tools/list sin herramientas"
r=$(curl -s -m 60 -X POST "$M" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"vacaciones_saldo","arguments":{"usuario":"lucia.martin"}}}')
[[ "$r" == *'"isError":false'* && "$r" == *disponibles* ]] && bien "tools/call vacaciones_saldo (lucia.martin)" || mal "vacaciones_saldo: ${r:0:200}"
r=$(kubectl -n "$SUITE_NS" run mcp-red-prueba --rm -i --restart=Never --image=busybox:1.37.0 --command -- \
  sh -c "wget -q -T 5 -O- http://$SUITE_APP:9081/probe/ready >/dev/null 2>&1 && echo abierto || echo cerrado" 2>/dev/null | grep -E '^(abierto|cerrado)$')
[[ "$r" == cerrado ]] && bien "NetworkPolicy: el 9081 está cerrado para otros pods" || mal "NetworkPolicy: el 9081 responde a cualquier pod (${r:-sin respuesta})"

echo
((errores == 0)) && ok "Todo correcto" || fail "$errores comprobación(es) con error"
exit $((errores > 0))
