#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Paso 5 · Script Applications y páginas del portal (con dxclient de CF238).
#
#  1. Pod temporal dxclient (imagen $DXCLIENT_IMAGE, secret regcred) en $DX_NS. "dxclient accept-license" acepta el
#     acuerdo de licencia de DXClient de HCL: ejecutar este script implica aceptarlo.
#  2. deploy-scriptapplication push de cada aplicación (build/k8s/scriptapps/<página>) en
#     "Script Application Library/Script Applications/" con el nombre "Orbita - <página>" (título «ÓRBITA · …»). Si ya existe se
#     actualiza (mismo contentId).
#  3. XMLAccess: una página por aplicación bajo $SUITE_PARENT_PAGE (nombres amigables mi-intranet, fichaje, vacaciones,
#     gastos, aprobaciones, quiosco) con un Web Content Viewer (JSR 286) que muestra la Script Application
#     (WCM_CONTENT_CONTEXT_IDR = contentId). Todas, quiosco incluido, solo para usuarios autenticados.
#
# Equivalente manual:  dxclient deploy-scriptapplication push ... --contentRoot <carpeta> --mainHtmlFile index.html
#                      dxclient xmlaccess ... --xmlFile paginas.xml
set -euo pipefail
source "$(dirname "$0")/config.sh"
require_cmd kubectl python3
require_vars DX_NS DX_RELEASE DXCLIENT_IMAGE SUITE_PARENT_PAGE
[[ -f "$SALIDA/scriptapps/mi-intranet/index.html" ]] || die "Faltan las Script Applications: ejecuta k8s/01-construir.sh"
POD=dxclient-suite
DX_INTERNAL="${DX_RELEASE}-haproxy.${DX_NS}.svc.cluster.local"   # DX desde dentro del clúster (certificado propio)
APPS=(mi-intranet:"Mi intranet":"My intranet"
      fichaje:"Fichaje":"Time tracking"
      vacaciones:"Vacaciones":"Time off"
      gastos:"Gastos y viajes":"Expenses and travel"
      aprobaciones:"Aprobaciones":"Approvals"
      quiosco:"Quiosco de fichaje":"Time clock kiosk")

# --- 1. dxclient -------------------------------------------------------------------------------------------------
info "Pod $POD ($DXCLIENT_IMAGE)"
kubectl -n "$DX_NS" delete pod "$POD" --ignore-not-found --wait >/dev/null
kubectl -n "$DX_NS" run "$POD" --image="$DXCLIENT_IMAGE" --restart=Never --overrides="{\"spec\":{
  \"imagePullSecrets\":[{\"name\":\"regcred\"}],
  \"containers\":[{\"name\":\"dxclient\",\"image\":\"$DXCLIENT_IMAGE\",\"command\":[\"sleep\",\"1800\"]}]}}" >/dev/null
trap 'kubectl -n "$DX_NS" delete pod "$POD" --wait=false >/dev/null 2>&1 || true' EXIT
kubectl -n "$DX_NS" wait --for=condition=Ready "pod/$POD" --timeout=10m >/dev/null
kubectl -n "$DX_NS" exec "$POD" -- sh -c 'cd /dxclient && bin/dxclient accept-license' | tail -1
kubectl -n "$DX_NS" cp "$SALIDA/scriptapps" "$POD:/tmp/scriptapps"
# Sintaxis del JavaScript (Node.js de la imagen de dxclient), tras los escapes de 01-construir.sh
kubectl -n "$DX_NS" exec "$POD" -- sh -c 'for d in /tmp/scriptapps/*/; do cp "$d/suite.js" /tmp/c.mjs
  node --check /tmp/c.mjs || { echo "JavaScript no válido: $d"; exit 1; }; done' || die "suite.js no es JavaScript válido"
ok "suite.js: sintaxis correcta"

# dxc <argumentos...>: dxclient contra DX con el administrador de web-engine-secret; usuario y contraseña viajan por
# stdin, no en la línea de órdenes
dxc() {
  { kubectl -n "$DX_NS" get secret web-engine-secret -o jsonpath='{.data.username}' | base64 -d; echo
    kubectl -n "$DX_NS" get secret web-engine-secret -o jsonpath='{.data.password}' | base64 -d; echo; } \
  | kubectl -n "$DX_NS" exec -i "$POD" -- sh -c 'read -r U; read -r P; cd /dxclient
      NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_NO_WARNINGS=1 bin/dxclient "$@" --dxProtocol https --hostname '"$DX_INTERNAL"' \
        --dxPort 443 --dxUsername "$U" --dxPassword "$P"' dxc "$@"
}

# --- 2. Script Applications ----------------------------------------------------------------------------------------
declare -A ID
for a in "${APPS[@]}"; do
  IFS=: read -r app titulo _ <<<"$a"
  info "Script Application «Orbita - $app»"
  out=$(dxc deploy-scriptapplication push --wcmSiteArea "Script Application Library/Script Applications/" \
          --wcmContentName "Orbita - $app" --wcmContentTitle "ÓRBITA · $titulo" \
          --contentRoot "/tmp/scriptapps/$app" --mainHtmlFile index.html 2>&1) || { echo "$out" | tail -5; die "push de $app"; }
  ID[$app]=$(grep -o '"contentId":"[^"]*"' <<<"$out" | tail -1 | cut -d'"' -f4)
  [[ -n "${ID[$app]}" ]] || { echo "$out" | tail -5; die "dxclient no devolvió el contentId de $app"; }
  ok "${ID[$app]}"
done

# --- 3. Páginas -----------------------------------------------------------------------------------------------------
info "Páginas bajo $SUITE_PARENT_PAGE (XMLAccess)"
mkdir -p "$SALIDA/dxcompose"
XML="$SALIDA/dxcompose/paginas.xml"
{ for a in "${APPS[@]}"; do IFS=: read -r app es en <<<"$a"; printf '%s\t%s\t%s\t%s\n' "$app" "$es" "$en" "${ID[$app]}"; done; } \
| SUITE_PARENT_PAGE="$SUITE_PARENT_PAGE" python3 -I -c '
import os, sys
from xml.sax.saxutils import escape
padre = os.environ["SUITE_PARENT_PAGE"]
paginas = []
for n, linea in enumerate(sys.stdin):
    app, es, en, idr = linea.rstrip("\n").split("\t")
    # Solo usuarios autenticados (también el quiosco); se quita el anónimo por si una versión anterior lo dio
    acceso = "<mapping subjectid=\"anonymous portal user\" subjecttype=\"user\" update=\"remove\"/>" \
        + "<mapping subjectid=\"all authenticated portal users\" subjecttype=\"user_group\" update=\"set\"/>"
    pref = lambda k, v: f"<preferences name=\"{k}\" update=\"set\"><value><![CDATA[{v}]]></value></preferences>"
    paginas.append(f"""
    <content-node action="update" active="true" allportletsallowed="true" content-parentref="padre" create-type="explicit"
        domain="rel" objectid="p{n}" ordinal="{1000 + n * 100}" type="staticpage" uniquename="suite.{app}">
      <supported-markup markup="html" update="set"/>
      <localedata locale="es"><title>{escape(es)}</title></localedata>
      <localedata locale="en"><title>{escape(en)}</title></localedata>
      <parameter name="com.ibm.portal.bookmarkable" type="string" update="set"><![CDATA[Yes]]></parameter>
      <parameter name="com.ibm.portal.friendly.name" type="string" update="set"><![CDATA[{app}]]></parameter>
      <parameter name="com.ibm.portal.layout.template.file.name.html" type="string" update="set"><![CDATA[layout.html]]></parameter>
      <parameter name="com.ibm.portal.layout.template.markup" type="string" update="set"><![CDATA[html]]></parameter>
      <parameter name="com.ibm.portal.layout.template.ref" type="string" update="set"><![CDATA[dav:fs-type1/themes/Portal8.5/layout-templates/1Column]]></parameter>
      <parameter name="com.ibm.portal.static.page.file.name.html" type="string" update="set"><![CDATA[layout.html]]></parameter>
      <access-control externalized="false" owner="undefined" private="false"><role actionset="User" update="set">{acceso}</role></access-control>
      <component action="update" active="true" domain="rel" ordinal="100" orientation="V" type="container">
        <component action="update" active="true" domain="rel" ordinal="100" orientation="H" type="container">
          <parameter name="com.ibm.portal.layoutnode.localname" type="string" update="set"><![CDATA[ibmHiddenWidgets]]></parameter>
          <parameter name="css-classes" type="string" update="set"><![CDATA[ibmDndRow hiddenWidgetsContainer wpthemeCol12of12 wpthemeFull]]></parameter>
        </component>
        <component action="update" active="true" domain="rel" ordinal="200" orientation="H" type="container">
          <parameter name="com.ibm.portal.layoutnode.localname" type="string" update="set"><![CDATA[ibmMainContainer]]></parameter>
          <parameter name="css-classes" type="string" update="set"><![CDATA[wpthemeLeft wpthemeCol ibmDndColumn wpthemeCol12of12 wpthemeFull wpthemePrimary]]></parameter>
          <component action="update" active="true" domain="rel" ordinal="100" type="control" skinref="sinMarco">
            <portletinstance action="update" domain="rel" portletref="visor">
              {pref("WCM_CONTENT_TYPE", "CONTENT")}
              {pref("WCM_CONTENT_CONTEXT_TYPE", "content")}
              {pref("WCM_CONTENT_CONTEXT_IDR", idr)}
              {pref("WCM_CONTENT_CONTEXT_IS_REL_PATH", "false")}
              {pref("WCM_BROADCASTS_TO", "WCM_LINKING_NONE")}
              {pref("WCM_LISTENS_TO", "WCM_LINKING_NONE")}
              {pref("WCM_PAGE_TITLE_TYPE", "WCM_PAGE_TITLE_TYPE_DEFAULT")}
              {pref("WCM_PORTLET_TITLE_TYPE", "WCM_PORTLET_TITLE_TYPE_DYN")}
            </portletinstance>
          </component>
        </component>
      </component>
    </content-node>""")
print(f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- ÓRBITA · páginas de DX Compose con las Script Applications (generado por k8s/05-scriptapps.sh) -->
<request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="PortalConfig_8.5.0.xsd"
    type="update" create-oids="true">
  <portal action="locate">
    <skin action="locate" objectid="sinMarco" uniquename="ibm.portal.85NoSkin"/>
    <web-app action="locate" uid="ilwwcm-localrenderingportlet-jsr.war.webmod">
      <portlet-app action="locate" uid="ilwwcm-localrenderingportlet-jsr.war">
        <portlet action="locate" objectid="visor" name="Web Content Viewer (JSR 286)"/>
      </portlet-app>
    </web-app>
    <content-node action="locate" objectid="padre" uniquename="{padre}"/>{"".join(paginas)}
  </portal>
</request>""")' > "$XML"
kubectl -n "$DX_NS" cp "$XML" "$POD:/tmp/paginas.xml"
out=$(dxc xmlaccess --xmlFile /tmp/paginas.xml --xmlAccessOutputFileName paginas-resultado.xml 2>&1 || true)
kubectl -n "$DX_NS" exec "$POD" -- cat /dxclient/store/outputFiles/xmlaccess/paginas-resultado.xml > "$SALIDA/dxcompose/paginas-resultado.xml" 2>/dev/null || true
grep -q '<status element="all" result="ok"/>' "$SALIDA/dxcompose/paginas-resultado.xml" \
  || { echo "$out" | tail -5; grep -A3 -i 'result="fail"\|<message' "$SALIDA/dxcompose/paginas-resultado.xml" | head; die "XMLAccess falló (ver $SALIDA/dxcompose/paginas-resultado.xml)"; }
ok "6 páginas creadas o actualizadas"
for a in "${APPS[@]}"; do IFS=: read -r app _ <<<"$a"; echo "    https://$DX_HOST${SUITE_PAGINAS}$app"; done
echo "Siguiente: k8s/99-verificar.sh"
