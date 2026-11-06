#!/usr/bin/env bash
# ÓRBITA · comprobaciones de solo lectura de una instalación (chart hcl-dx-orbita).
#   NS (por defecto dx-shared), RELEASE (orbita) y DX_HOST (si no, se lee del Ingress).
set -uo pipefail
NS="${NS:-${SHARED_NS:-dx-shared}}"; RELEASE="${ORBITA_RELEASE:-orbita}"
ok() { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
ko() { printf '  \033[31mFALLO\033[0m %s\n' "$*"; FALLOS=$((FALLOS + 1)); }
FALLOS=0
DX_HOST="${DX_HOST:-$(kubectl -n "$NS" get ingress "$RELEASE"-api -o jsonpath='{.spec.rules[0].host}' 2>/dev/null)}"

echo "ÓRBITA ($RELEASE en $NS, $DX_HOST)"
helm -n "$NS" status "$RELEASE" >/dev/null 2>&1 && ok "release $RELEASE: $(helm -n "$NS" list -f "^$RELEASE\$" -o json | python3 -c 'import json,sys; r=json.load(sys.stdin)[0]; print(r["chart"], r["status"])')" || ko "no existe la release $RELEASE"
kubectl -n "$NS" get job "$RELEASE"-db -o jsonpath='{.status.succeeded}' 2>/dev/null | grep -q 1 && ok "base de datos y usuario creados (job $RELEASE-db)" || ko "job $RELEASE-db sin completar"
r=$(kubectl -n "$NS" get deploy "$RELEASE"-api -o jsonpath='{.status.readyReplicas}/{.spec.replicas}' 2>/dev/null)
[[ "$r" =~ ^([1-9][0-9]*)/\1$ ]] && ok "orbita-api lista ($r)" || ko "orbita-api no está lista ($r)"
kubectl -n "$NS" get job "$RELEASE"-scriptapps-push -o jsonpath='{.status.succeeded}' 2>/dev/null | grep -q 1 \
  && ok "Script Applications y páginas: $(kubectl -n "$NS" logs job/"$RELEASE"-scriptapps-push -c dxclient 2>/dev/null | grep -c "is in WCM") apps en WCM" \
  || ko "job $RELEASE-scriptapps-push sin completar (kubectl -n $NS logs job/$RELEASE-scriptapps-push -c dxclient)"
if [[ -n "$DX_HOST" ]]; then
  s=$(curl -sk -o /dev/null -w '%{http_code}' "https://$DX_HOST/orbita-api/v1/salud"); [[ "$s" == 200 ]] && ok "https://$DX_HOST/orbita-api/v1/salud → 200" || ko "https://$DX_HOST/orbita-api/v1/salud → $s"
  s=$(curl -sk -o /dev/null -w '%{http_code}' "https://$DX_HOST/orbita-api/v1/yo"); [[ "$s" == 401 ]] && ok "sin sesión de DX → 401" || ko "sin sesión de DX → $s (se esperaba 401)"
fi
P=$(kubectl -n "$NS" get pod -l app.kubernetes.io/instance="$RELEASE",app.kubernetes.io/component=api -o name 2>/dev/null | head -1)
if [[ -n "$P" ]]; then
  kubectl -n "$NS" logs "$P" 2>/dev/null | grep -q "orbita-api lista" && ok "esquema de la base de datos al día (Flyway)" || ko "orbita-api no ha preparado la base de datos (kubectl -n $NS logs $P)"
fi
echo; [[ $FALLOS -eq 0 ]] && echo "Todo correcto." || { echo "$FALLOS comprobaciones fallidas."; exit 1; }
