# ÓRBITA en HCL DX Compose (Kubernetes)

Despliegue de ÓRBITA (Fichaje, Vacaciones, Gastos, Aprobaciones, Mi intranet y Quiosco) sobre el entorno de los
[labs de DX Compose](../../Github_Andres/hcl-dx-compose-labs-main/) (CF238), **sin portlets**:

| Pieza | WebSphere Portal 8.5 | DX Compose (esta carpeta) |
|---|---|---|
| Interfaz React | Dentro de cada portlet | Una **Script Application** por aplicación, en su página bajo *Home* |
| Lógica y datos | `serveResource` del portlet | Servicio REST **`suite-api`** (Open Liberty 26.0.0.8, como la WebEngine) en `dx-shared`, publicado en `https://<DX_HOST>/suite-api` |
| Usuarios | Registro del portal | Los 8 empleados en el **OpenLDAP del Lab 2A** (`wpsadmin` sigue en el registro básico) |
| Sesión | La del portal | **SSO con LTPA**: la API acepta la cookie `LtpaToken2` del portal (mismas claves y mismo realm que la WebEngine) |
| Base de datos | Derby (`jdbc/suiteIntranet`) | **PostgreSQL 18** del Lab 2B: base `suite_intranet`, usuario `suiteuser` |
| IA | — | **Servidor MCP** (`orbita-mcp.war`) en el puerto 9081 del mismo pod, solo dentro del clúster ([../mcp/README.md](../mcp/README.md)) |

Requisitos: Labs 1, 2A y 2B hechos, `env.sh` de los labs (lo carga `config.sh`; carpeta en `DX_LABS`), `kubectl`,
`curl`, `python3` y `envsubst`. No hace falta Java, Node ni Docker: `01-construir.sh` descarga un JDK portable.

```bash
k8s/01-construir.sh        # compila suite-api.war (Java 8) y prepara las Script Applications
k8s/02-usuarios-ldap.sh    # empleados de la suite en el OpenLDAP (contraseña demo1234)
k8s/03-base-datos.sh       # suite_intranet en PostgreSQL 18 (las tablas las crea la API al primer acceso)
k8s/04-api.sh              # suite-api: secret SSO, ConfigMap, PVC, Deployment, Service y ruta /suite-api
k8s/05-scriptapps.sh       # dxclient: Script Applications + páginas (XMLAccess)
k8s/06-mcp-iq.sh           # registra el MCP en DX IQ (repetir tras añadir herramientas o actualizar IQ)
k8s/99-verificar.sh        # comprobaciones de solo lectura
```

Todos son idempotentes. Tras cambiar el código: `01-construir.sh` y luego `04-api.sh` (Java) o `05-scriptapps.sh`
(interfaz).

Páginas, todas solo para usuarios autenticados:
`https://<DX_HOST>/wps/myportal/Home/{mi-intranet,fichaje,vacaciones,gastos,aprobaciones,quiosco}`.

## Cambios en el código respecto a Portal 8.5

- `Db.java`: con PostgreSQL usa `DOUBLE PRECISION` y `BYTEA` en lugar de `DOUBLE` y `BLOB(8M)`, y busca las tablas en
  minúsculas en el catálogo. Sigue funcionando con Derby.
- `Gastos.java`, `Demo.java`: tickets nulos con `setBytes(i, null)` (con `setNull(BLOB)` PostgreSQL espera un `oid`).
- `ApiServlet.java`: si el usuario llega como DN (`uid=...,ou=users,...`) se queda con el uid.
- `server.xml` pasa `stringtype=unspecified` al controlador: Derby convierte las cadenas en fechas al enlazar con
  `setString` y PostgreSQL no.

## Detalles a tener en cuenta

- **WCM borra `[$…]` al servir el JavaScript.** WCM lo toma por una etiqueta suya, también con espacios (`[ $`), y
  rompe el bundle (`[$,H]=useState()`). `01-construir.sh` lo escribe con escapes equivalentes (`[\u0024`,
  `` `\x5b${ ``), `05-scriptapps.sh` comprueba la sintaxis con `node --check` y `99-verificar.sh` compara byte a
  byte lo que sirve DX con lo construido.
- **Claves LTPA.** `04-api.sh` copia las de la imagen de la WebEngine. Son las mismas en todas las instalaciones de
  CF238, así que valen para la demo y no para producción. En producción hay que definir unas claves propias en DX
  (`security.webEngine.ltpa.customLtpaSecret`) y usar ese secret aquí.
- **Quiosco solo con sesión.** En Portal 8.5 el quiosco era público. Aquí, por decisión del proyecto, su página es
  solo para usuarios autenticados (la tablet de la entrada inicia sesión con un usuario). El contenido WCM de las
  Script Applications tampoco es legible por el anónimo. El servicio `/suite-api/publico` sigue sin sesión: el quiosco
  identifica a cada persona por su PIN o su QR, igual que antes.
- **dxclient** exige aceptar su licencia de HCL: `05-scriptapps.sh` ejecuta `dxclient accept-license`.
- El OCR de tickets (Tesseract.js) descarga su motor desde internet en el navegador, igual que en Portal 8.5.
