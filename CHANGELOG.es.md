# Historial de versiones

[English](CHANGELOG.md) · **Español**

## 2.0.0 · 2026-11-06 · Chart de Helm

**Instalación**
- Un chart de Helm, **`hcl-dx-orbita`** (`oci://ghcr.io/europesip/charts`), en lugar de los scripts `k8s/01`–`06`.
  Un Job crea la base de datos, un Deployment ejecuta la API y el subchart `hcl-dx-scriptapp` 0.2.0 sube las seis
  Script Applications y crea las páginas. Sin `kubectl cp`, sin volumen para el código y sin `envsubst`.
- Imágenes construidas y probadas por CI: **`orbita-api`** (Open Liberty 26.0.0.9, Java 21) y **`orbita-scriptapps`**
  (las apps construidas), en `ghcr.io/europesip/orbita`.
- **Necesita PostgreSQL** (con un Secret de superusuario, para que el chart cree su base y su usuario). En las
  siguientes versiones se podrán usar otras bases de datos.

**Usuarios y seguridad**
- **Quién es el usuario lo dice DX**: la API reenvía la cookie de sesión del usuario a la API de perfil de DX. Ya no se
  copian las claves LTPA de la Web Engine de DX, no se replican el LDAP ni el registro básico, y la API no guarda
  credenciales de administrador de DX ni del bind del LDAP.
- **El servidor MCP actúa como el usuario del chat de IQ**, identificado por la sesión de DX que reenvía el
  Integrator. Desaparece el argumento `usuario`: el modelo ya no puede elegir en nombre de quién actúa.
- **Usuarios de la demo por papeles**: la historia se escribe por papeles y cada papel lo hace un usuario de DX que ya
  existe (`demo.people`; por defecto, los usuarios de los labs `patricia`, `andres`, `macarena`, `eduardo`, `enrique`,
  `jordi`, `german`). Ya no se dan de alta usuarios en el OpenLDAP.
- La clave del quiosco la genera el chart (Secret), en lugar de una clave fija en el código.

**Datos**
- **Migraciones Flyway** (`V1__esquema.sql`, …) crean y actualizan el esquema; una actualización nunca borra datos.
  Antes, un cambio de esquema borraba todas las tablas y volvía a cargar la demo.
- Solo PostgreSQL (desaparece Derby, de la época de WebSphere Portal). Base `orbita`, usuario `orbita`.
- Restaurar la demo vacía las tablas (`TRUNCATE`) y vuelve a cargar los datos.

**Código y API**
- Repositorio reorganizado: `api/` (Maven, Java 21, Jakarta EE 10: `core`, `rest`, `mcp`), `web/`, `images/`,
  `chart/`, `docs/`. Paquete `com.europesip.orbita`.
- **API REST `/orbita-api/v1`** con métodos, rutas y códigos HTTP reales (401, 422, 404, 405), descrita en
  `api/rutas.json` y compartida por el servidor y la interfaz. Antes: `POST /suite-api/api` con `op=…`, siempre 200.
- Fuera los restos de WebSphere Portal 8.5: `portlet/java/com/demo/suite`, `web.xml`, `ibm-web-bnd.xml`, Java 8.
- Las páginas del portal y la clave del quiosco las da la API (`GET /v1/config`), no el HTML de las Script
  Applications.

**Licencia**: PolyForm Noncommercial 1.0.0 (código abierto para fines no comerciales: se permite usarlo y modificarlo).

## 1.0.0 · 2026-11-06 · Primera versión para DX Compose

- La suite de intranet de WebSphere Portal 8.5 (portlets JSR 286) migrada a **HCL DX Compose CF238** sin portlets:
  seis Script Applications y un servicio REST, `suite-api`, en Open Liberty 26.0.0.8.
- Instalación con los scripts `k8s/01-construir.sh` … `06-mcp-iq.sh`: construcción local de las WAR (Java 8), alta de
  los empleados en el OpenLDAP de los labs (`lucia.martin`, `javier.gomez`… con contraseña `demo1234`), base
  `suite_intranet` en el PostgreSQL de los labs, WAR copiadas a un volumen con `kubectl cp`, y Script Applications y
  páginas con DXClient.
- SSO con las claves LTPA copiadas de la Web Engine de DX y los registros de DX replicados en el servicio.
- Primer servidor MCP para HCL DX IQ (`vacaciones_saldo`, `vacaciones_solicitar`), con el empleado como argumento.
