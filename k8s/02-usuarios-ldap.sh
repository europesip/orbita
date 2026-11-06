#!/usr/bin/env bash
# ÓRBITA en HCL DX Compose · Paso 2 · Dar de alta a los empleados de la suite en el OpenLDAP del Lab 2A.
#
# La suite identifica a cada persona por su uid (lucia.martin, carlos.ruiz...). Al estar en el LDAP que usa DX Compose,
# los mismos usuarios entran en el portal y en el servicio REST (SSO con LTPA, paso 4). No modifica el LDIF del lab:
# añade las entradas con ldapadd -c, así que repetirlo no cambia nada (las que ya existen se saltan).
#
# Equivalente manual:  ldapadd -c -x -H ldap://localhost:1389 -D cn=admin,dc=dxdemo,dc=com -W -f suite-usuarios.ldif
set -euo pipefail
source "$(dirname "$0")/config.sh"
require_cmd kubectl python3
require_vars SHARED_NS LDAP_RELEASE SUITE_USERS_PASSWORD
POD="${LDAP_RELEASE}-0"
BASE="dc=dxdemo,dc=com"

info "Alta de usuarios en $POD (contraseñas como hash {SSHA}; ldapadd -c continúa si alguno ya existe)"
# La contraseña viaja por una variable de entorno y el LDIF por stdin: nunca en la línea de órdenes
SUITE_USERS_PASSWORD="$SUITE_USERS_PASSWORD" python3 -I -c '
import base64, hashlib, os, sys
pw = os.environ["SUITE_USERS_PASSWORD"].encode()
def ssha():
    salt = os.urandom(8)
    return "{SSHA}" + base64.b64encode(hashlib.sha1(pw + salt).digest() + salt).decode()
sys.stdout.write("".join(l.replace("${SUITE_USERS_PASSWORD}", ssha()) for l in open(sys.argv[1], encoding="utf-8")))' \
  "$(dirname "$0")/suite-usuarios.ldif" \
| kubectl -n "$SHARED_NS" exec -i "$POD" -c openldap-stack-ha -- sh -c \
    "ldapadd -c -x -H ldap://localhost:1389 -D cn=admin,$BASE -w \"\$LDAP_ADMIN_PASSWORD\" 2>&1 | grep -v -E '^\$|Already exists|^adding new entry' || true"

info "Comprobación"
n=$(kubectl -n "$SHARED_NS" exec "$POD" -c openldap-stack-ha -- sh -c \
  "ldapsearch -x -LLL -H ldap://localhost:1389 -D cn=admin,$BASE -w \"\$LDAP_ADMIN_PASSWORD\" -b ou=users,$BASE '(uid=*.*)' uid" | grep -c '^uid:')
[[ "$n" -ge 8 ]] && ok "$n empleados de la suite en ou=users,$BASE" || die "Solo hay $n empleados de la suite en el LDAP"
printf '%s' "$SUITE_USERS_PASSWORD" | kubectl -n "$SHARED_NS" exec -i "$POD" -c openldap-stack-ha -- sh -c \
  "umask 077; cat > /tmp/.pw; ldapwhoami -x -H ldap://localhost:1389 -D uid=lucia.martin,ou=users,$BASE -y /tmp/.pw >/dev/null; rc=\$?; rm -f /tmp/.pw; exit \$rc" \
  && ok "lucia.martin se autentica" || die "lucia.martin no se autentica"
echo "Siguiente: k8s/03-base-datos.sh"
