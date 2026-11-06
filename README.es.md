<p align="center"><img src="web/marca/orbita-logo.svg" alt="ÓRBITA" width="430"></p>

# ÓRBITA · Fichaje, Vacaciones, Gastos y Aprobaciones para HCL DX

[English](README.md) · **Español** · [Manual (PDF)](docs/manual/orbita-explicada.es.pdf) · [Presentación (PDF)](docs/presentation/orbita-presentacion.es.pdf) · [Preguntas frecuentes](docs/faq.es.md) · [Historial de versiones](CHANGELOG.es.md) · [Contacto](#contacto-y-servicios)

**ÓRBITA** es una suite de intranet para **HCL DX Compose** (CF239), de **EUROPESIP**. Su interfaz React se publica
como seis **Script Applications**; la lógica y los datos están en una API REST (**`orbita-api`**, Open Liberty) con
PostgreSQL, que incluye también un **servidor MCP** para que **HCL DX IQ** responda y actúe en nombre del usuario. Todo
se instala con **un chart de Helm**, `hcl-dx-orbita`. Qué hace cada aplicación:
[docs/ESPECIFICACION.md](docs/ESPECIFICACION.md).

> **Versión 3.1.0.** Necesita **PostgreSQL** (ver [Requisitos](#requisitos)); en las siguientes versiones se podrán
> usar otras bases de datos. La interfaz está en **español e inglés**, en el idioma del perfil de DX de cada usuario.
> Tiene **asistente de IA propio** ([más abajo](#qué-preguntarle-a-la-ia-sobre-órbita)), y la integración con HCL DX IQ es opcional.

| Página (solo usuarios con sesión) | URL en los labs de HCL DX Compose |
|---|---|
| Mi intranet | https://dx-demo.apps.promox.europesip-lab.com/wps/myportal/Home/mi-intranet |
| Fichaje | .../wps/myportal/Home/fichaje |
| Vacaciones | .../wps/myportal/Home/vacaciones |
| Gastos y viajes | .../wps/myportal/Home/gastos |
| Aprobaciones | .../wps/myportal/Home/aprobaciones |
| Quiosco de fichaje | .../wps/myportal/Home/quiosco |

## Contenido

- [Usuarios de la demo](#usuarios-de-la-demo) · [Funciones](#funciones) · [Arquitectura](#arquitectura)
- [Preguntas a la IA](#qué-preguntarle-a-la-ia-sobre-órbita) · [Requisitos](#requisitos) · [Instalación con Helm](#instalación-con-helm) · [Integración con HCL DX IQ](#integración-con-hcl-dx-iq-el-servidor-mcp)
- [Actualizar y desinstalar](#actualizar-y-desinstalar) · [Repositorio](#repositorio) · [Desarrollo](#desarrollo)
- [Historial de versiones](CHANGELOG.es.md) · [Preguntas frecuentes](#preguntas-frecuentes) · [Licencia](#licencia) · [Contacto y servicios](#contacto-y-servicios)
- **Manual ilustrado (PDF)**: [Español](docs/manual/orbita-explicada.es.pdf) · [English](docs/manual/orbita-explained.en.pdf)

## Usuarios de la demo

La historia de la demo (quién pide vacaciones, quién olvida fichar, quién aprueba, quién paga) se escribe por
**papeles**, y cada papel lo hace un **usuario de DX que ya existe**: no hay que dar de alta usuarios en el directorio.
El reparto es el valor `demo.people` del chart; por defecto, los usuarios del OpenLDAP de los
[labs](https://github.com/europesip/hcl-dx-compose-labs):

| Papel | Usuario (labs) | Rol en ÓRBITA | PIN del quiosco |
|---|---|---|---|
| `rrhh` | `patricia` | RRHH: ve a toda la plantilla, exporta, restaura la demo | 1000 |
| `ventas-responsable` | `andres` | Responsable de Ventas: aprueba a su equipo | 2001 |
| `ventas-1` | `macarena` | Comercial | 1111 |
| `ventas-2` | `eduardo` | Comercial | 2222 |
| `tecnologia-responsable` | `enrique` | Responsable de Tecnología | 3001 |
| `tecnologia-1` | `jordi` | Desarrollador | 3333 |
| `administracion` | `german` | Administración: paga las notas de gasto | 6001 |
| `tecnologia-2`, `tecnologia-3` | (ficticios) | Aparecen en los datos; nadie entra con ellos | 4444, 5555 |

Cada persona ve su PIN y su tarjeta QR en *Fichaje › Mi tarjeta de quiosco*. Para repetir la demo desde cero: RRHH ›
*Fichaje* › *Informes* › **Restaurar datos de demostración**. Los datos son relativos al día en que se cargan.

## Funciones

- **Asistente «✨ Pregúntale a ÓRBITA»** (cabecera de todas las aplicaciones o del theme de ejemplo): el asistente
  propio de ÓRBITA en un panel lateral, con la sesión del portal (o el chat de HCL DX IQ, ver
  [Tres formas de poner IA en ÓRBITA](#tres-formas-de-poner-ia-en-órbita)). Responde con las herramientas del MCP de ÓRBITA como el usuario que pregunta
  («¿cuántas vacaciones me quedan?», «pídeme del 9 al 11 de diciembre»…).
- **Mi intranet**: saludo con fichaje rápido, horas de las últimas seis semanas, saldo de vacaciones, gastos del año por
  categoría, solicitudes por aprobar, quién falta los próximos 14 días y últimos avisos.
- **Fichaje**, **vacaciones y ausencias**, **gastos y viajes** (tickets con OCR en el navegador, con Tesseract.js),
  **aprobaciones** con conversación, **avisos** (campana) y **quiosco de fichaje** (PIN o tarjeta QR).

## Arquitectura

```
 Navegador ── https://<host de DX> ──┬── /wps/...         HCL DX: páginas con las 6 Script Applications (WCM)
                                     └── /orbita-api/v1   Ingress ──► orbita-api (Open Liberty, :9080)
                                                                        │  ¿quién es? ── cookie LtpaToken2 ──► API de perfil de DX
                                                                        └─ PostgreSQL: base "orbita" (Flyway)
 Integrator de DX IQ ── cookies de DX del usuario ──► orbita-api :9081 /mcp (solo dentro del clúster)
```

- **Quién es el usuario lo dice DX.** La API reenvía la cookie de sesión del usuario (`LtpaToken2`) a la API de perfil
  de DX. Sin claves LTPA compartidas, sin configuración de LDAP y sin credenciales de administrador de DX en la API.
- **Base de datos**: su propia base y su usuario, que crea el chart; las tablas las crean y actualizan **migraciones
  Flyway**. Nunca se borran datos al actualizar.
- **Servidor MCP**: `POST /mcp` y `GET /probe/ready` en el puerto 9081 del mismo pod, solo para el Integrator de IQ
  (NetworkPolicy). Las herramientas actúan como el usuario del chat de IQ, identificado por su sesión de DX.

## Qué preguntarle a la IA sobre ÓRBITA

El botón «✨ Pregúntale a ÓRBITA» de cada aplicación abre el **asistente propio de ÓRBITA**, que responde y actúa
**como el usuario que pregunta**, con **26 herramientas** ([eliges cuáles](#elegir-qué-herramientas-mcp-se-publican)): su día, el fichaje (también
fichar), las vacaciones (saldo, solicitudes, calendario del equipo), los gastos y viajes (notas, añadir gastos,
enviarlas), las aprobaciones (aprobar, rechazar, comentar) y los avisos. Algunos ejemplos:

| Área | Pregunta, por ejemplo |
|---|---|
| Mi día | «¿Qué tengo hoy?» · «¿Tengo algo pendiente de aprobar?» |
| Fichaje | «Ficha mi entrada en teletrabajo» · «¿Qué días de este mes no cerré el fichaje?» · «El martes olvidé fichar la salida a las 18:05: pide la corrección» |
| Vacaciones | «¿Cuántos días de vacaciones me quedan?» · «Pídeme vacaciones del 9 al 11 de diciembre» · «¿Quién del equipo falta en diciembre?» |
| Gastos | «¿Cuánto me deben?» · «Crea una nota "Visita a Sevilla" y añade una comida de ayer de 42,80 €» · «Envíasela a mi responsable» |
| Aprobaciones | «¿Qué tengo que aprobar?» · «Aprueba las vacaciones de macarena» · «Rechaza el viaje a Barcelona: presupuesto más ajustado» |

**Pregunta en español o en inglés**: el asistente responde en el idioma de la pregunta. **Más de 60 preguntas de
ejemplo, por áreas: [docs/preguntas-ia.md](docs/preguntas-ia.md)** (en inglés: [docs/ai-questions.md](docs/ai-questions.md)). Lo que cambia datos
pide antes tu confirmación; pagar, restaurar la demo, borrar y exportar se quedan en la aplicación.

### Tres formas de poner IA en ÓRBITA

1. **El asistente propio de ÓRBITA (por defecto, el recomendado para la plantilla).** `orbita-api` habla con el modelo
   a través de **LiteLLM** con **solo las herramientas de ÓRBITA**, como el usuario de la sesión de DX. Su prompt es
   pequeño: sin las herramientas de HCL DX ni el prompt de sistema de IQ, así que **cada pregunta gasta muchos menos
   tokens**. El modelo es un alias de LiteLLM, por defecto el mismo que usa HCL DX IQ (`iq-general-purpose`), así que
   funciona con cualquier LiteLLM preparado para IQ. Registra otro alias para dar a ÓRBITA un modelo distinto (más
   barato, privado, propio…). No necesita HCL DX IQ.

   ```yaml
   assistant:
     backend: orbita            # orbita (asistente propio, por defecto) | iq (chat de HCL DX IQ) | none (sin botón)
     litellm:
       url: http://litellm.dx-shared.svc.cluster.local:4000   # LiteLLM o cualquier API compatible con OpenAI
       apiKeySecret: {name: litellm-env, key: PROXY_MASTER_KEY}
     model: iq-general-purpose  # alias de LiteLLM: por defecto el mismo que HCL DX IQ; registra otro solo para ÓRBITA
   ```

2. **El chat de HCL DX IQ (`assistant.backend: iq`).** IQ está pensado para los **profesionales de DX** que gestionan el
   portal. Su chat (el botón ✨ de DX) usa el modelo configurado en IQ y **todos los servidores MCP del Integrator** a la
   vez: las 55 herramientas de HCL DX (WCM, DAM, páginas) más las de ÓRBITA. Así una pregunta puede mezclar contenido del
   portal y datos de ÓRBITA, a cambio de un prompt mucho mayor. Necesita el parche de la lista de MCP que se explica
   abajo. Con `backend: iq`, el botón de las aplicaciones de ÓRBITA abre el chat de IQ.

3. **Con un chat de IA propio, aparte de IQ.** El servidor MCP de ÓRBITA es **MCP estándar** (Streamable HTTP,
   JSON-RPC) y la API REST está descrita en `api/rutas.json`, así que cualquier cliente MCP o un chatbot propio puede
   usarlos: un servicio de chat vuestro con cualquier LLM (directo o a través del mismo LiteLLM), Microsoft Copilot
   Studio, Claude, un bot de Teams o de WhatsApp… La única condición es la **identidad**: ÓRBITA actúa como el usuario
   de la sesión de DX que recibe. Un chat dentro de las páginas de DX (por ejemplo, el panel de ÓRBITA apuntando a
   vuestro propio back end) puede reenviar esa sesión; un chat fuera de DX necesita un intercambio de identidad (OAuth /
   token), que EUROPESIP puede construir dentro de los servicios de abajo.

## Requisitos

| | |
|---|---|
| **HCL DX Compose** | CF239 en Kubernetes, con un Ingress (ingress-nginx) para su nombre de host. Un usuario **administrador** de DX para DXClient (sube las Script Applications y crea las páginas con XMLAccess) |
| **PostgreSQL** | **Obligatorio en la versión 2.x** (probado con PostgreSQL 18 / CloudNativePG), accesible desde el clúster, y un Secret con un **superusuario** (claves `username` y `password`) para que el chart cree su base de datos y su usuario. Si no lo tienes, los labs lo instalan en unos 3 minutos: [Dependencias externas](https://github.com/europesip/hcl-dx-compose-labs/blob/main/external-deps/GUIDE.es.md) (`external-deps/02-postgres.sh`). **En las siguientes versiones se podrán usar otras bases de datos** |
| **Usuarios** | Los usuarios de DX de `demo.people` (en los labs, los del OpenLDAP del Lab 2A) |
| **HCL DX IQ** (opcional) | Para el asistente: IQ instalado (Lab 3 de los labs) |
| **Imágenes y chart** | Públicos, en `ghcr.io/europesip`: no hace falta iniciar sesión en el registro |
| **Herramientas** | `kubectl` y Helm 3.8 o superior (charts OCI) |

## Instalación con Helm

Se instala en el namespace de las herramientas de terceros, junto a PostgreSQL (en los labs, `dx-shared`).

**1. Secrets** (una vez):

```bash
NS=dx-shared
# Administrador de DX para DXClient (Script Applications y páginas)
kubectl -n $NS create secret generic orbita-dx --from-literal=username=wpsadmin --from-literal=password='<contraseña>'
# CA del certificado de DX (autofirmado o de una CA privada). En los labs: el propio certificado
kubectl -n dx-demo get secret dx-tls-cert -o jsonpath='{.data.tls\.crt}' | base64 -d > dx-ca.crt
kubectl -n $NS create secret generic orbita-dx-ca --from-file=ca.crt=dx-ca.crt
```

**2. Valores** (`orbita-values.yaml`; cada valor está explicado en [values.yaml](chart/hcl-dx-orbita/values.yaml)):

```yaml
dx:
  host: dx-demo.apps.promox.europesip-lab.com     # nombre de host público de DX
  caSecret: orbita-dx-ca
database:
  host: dx-pg-rw.dx-shared.svc.cluster.local      # PostgreSQL (requisito)
  create:
    superuserSecret: dx-pg-superuser              # crea la base y el usuario "orbita"
mcp:
  networkPolicy:
    integratorNamespace: dx-demo                  # namespace de HCL DX IQ
scriptapps:                                       # subchart hcl-dx-scriptapp: se repiten los datos de DX
  dx:
    host: dx-demo.apps.promox.europesip-lab.com
    credentialsSecret: orbita-dx
    caSecret: orbita-dx-ca
  dxclient:
    acceptLicense: true                           # aceptas la licencia de HCL DXClient
# demo.people: quién hace cada papel (por defecto, los usuarios de los labs)
```

**3. Instalar**:

```bash
helm upgrade --install orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version 3.1.0 \
  -n dx-shared -f orbita-values.yaml --timeout 15m
```

Qué ocurre, por orden:

1. Un **Job** crea el usuario y la base de datos en PostgreSQL (idempotente). La contraseña de ÓRBITA la genera el
   chart y se conserva entre actualizaciones (Secret `orbita-db`).
2. Arranca **`orbita-api`**: Flyway crea las tablas y se cargan los datos de la demo. Además, el Service, el Ingress en
   `/orbita-api` del host de DX y la NetworkPolicy del MCP.
3. El **Job de scriptapps** sube las seis Script Applications a WCM con HCL DXClient y crea las seis páginas bajo
   *Home* con XMLAccess.

**4. Comprobar**: `kubectl -n dx-shared logs job/orbita-scriptapps-push -c dxclient | tail -3`, y
`https://<host de DX>/orbita-api/v1/salud` debe contestar `ok`. Después, entra en DX con un usuario de la demo y abre
*Mi intranet*.

**En los labs de HCL DX Compose**, lo mismo con un script (lee el `env.sh` de los labs y crea los secrets):

```bash
DXCLIENT_ACCEPT_LICENSE=yes scripts/instalar-en-labs.sh
scripts/verificar.sh
```

### Opciones: páginas y qué muestran las aplicaciones

**Páginas (opcional).** Por defecto el chart crea una página de DX por aplicación bajo *Home* (`pages.create: true`).
Para colocar tú las seis Script Applications (en tus propias páginas, con tu propio diseño), instala con
`pages.create: false`: las apps se suben igualmente a WCM (*Script Application Library › Script Applications*, títulos
«ÓRBITA · …») y añades cada una a la página que quieras. Después ajusta `pages.base` (y mantén los nombres amigables
`mi-intranet`, `fichaje`, `vacaciones`, `gastos`, `aprobaciones`, `quiosco`) para que las apps se enlacen bien entre sí.

**Idioma.** Cada usuario ve ÓRBITA en el idioma de su perfil de DX (`preferredLanguage`). Si no lo tiene, ÓRBITA usa el
idioma con el que DX pinta la página y, después, el del navegador. Para cualquier idioma que no sea español ni inglés,
usa inglés. Mensajes, fechas, importes y avisos lo siguen. Los datos de la demo siguen en español.

**Ajustes de cada aplicación en su página.** Quien edita la página en DX (**modo edición**, con el rol Editor o
superior sobre la aplicación) ve «⚙ Ajustes de esta aplicación». Ahí elige, solo para esa instancia, las partes de la
cabecera, el pie y el idioma (*Automático*, Español, English). Se guardan como preferencias de la Script Application en
DX, se mantienen al actualizar el chart, y lo que no se cambie sigue los valores `ui.*` de abajo.

**Theme de ejemplo.** Por defecto el chart despliega también un theme de ÓRBITA para sus páginas, para que se vean
como una intranet terminada que funciona sobre HCL DX:

- Una copia del theme **Portal 8.5** de HCL DX, hecha al instalar desde **tu propio DX** (solo WebDAV, sin EAR: los
  ficheros del theme de HCL no forman parte de ÓRBITA), con una cabecera de ÓRBITA: el **logo de la empresa**,
  **«Powered by HCL Software»** y un **botón que abre el asistente de ÓRBITA**. Todo lo demás (barra de herramientas,
  menús, modo edición) es el theme Portal 8.5.
- Las imágenes están en una **colección del DAM** (`ÓRBITA`): para poner el logo de tu empresa, sube allí una nueva
  versión de `company-logo.png`; el theme muestra siempre su última versión. O dalo al instalar con
  `--set theme.logoBase64=$(base64 -w0 logo.png)`.
- Se asigna **solo a las páginas de ÓRBITA**; el resto del portal mantiene su theme.

```yaml
theme:
  enabled: true          # false: las páginas mantienen el theme que tengan
  hclLogo: true          # «Powered by HCL Software»
  assistantButton: true  # botón del asistente en la cabecera (solo en páginas con una aplicación de ÓRBITA)
  headerBackground: "linear-gradient(90deg, #15123B 0%, #2A1B6B 55%, #0B2A6F 100%)"
```

**Cabecera y pie.** Las aplicaciones van dentro de páginas de DX, así que tu tema puede mostrar ya parte de su
cabecera, como el nombre del usuario. Oculta en las aplicaciones lo que ya muestre el tema:

```yaml
ui:
  header:
    title: true          # logo de ÓRBITA, título y subtítulo de la app
    homeLink: auto       # enlace «Mi intranet» (auto: oculto con el theme de ejemplo, que lo tiene en su menú)
    assistant: auto      # botón del asistente de IA (auto: oculto si el theme de ejemplo lo muestra en la cabecera)
    notifications: true  # campana de avisos
    user: auto           # nombre, rol y avatar del usuario (auto: oculto con el theme de ejemplo, que ya lo muestra)
  footer: true
```

## Integración con HCL DX IQ (el servidor MCP)

Para que el asistente de IQ use ÓRBITA, el Integrator de IQ tiene que conocer el servidor MCP de ÓRBITA: hay que
añadir su URL base, `http://orbita-api.dx-shared.svc.cluster.local:9081` (`<release>-api.<namespace>`), a su **lista
de servidores MCP**. IQ añade `/mcp` y `/probe/ready` por su cuenta.

**Por qué hace falta un parche (bug de HCL DX IQ, caso CS1479102).** HCL documenta la variable `MCP_SERVER_LIST`
(`environment.pod.integrator` en el chart `hcl-dx-iq`) para esa lista, pero no tiene efecto: el chart genera además el
ConfigMap `<release de IQ>-integrator` con su propia lista fija (clave `dx.config.integrator.mcp_server_list`, solo con
el MCP de HCL), y esa es la lista que lee el Integrator. Sigue presente en CF239 (IQ 1.0.3). Hasta que HCL lo corrija,
la solución es **parchear esa clave del ConfigMap** y reiniciar el Integrator:

```bash
# Lista actual (se conserva lo que hay: el MCP de HCL y cualquier otro)
LIST=$(kubectl -n dx-demo get configmap dx-iq-integrator -o jsonpath='{.data.dx\.config\.integrator\.mcp_server_list}')
# Se añade ÓRBITA y se reinicia el Integrator (lee la lista y las herramientas al arrancar)
kubectl -n dx-demo patch configmap dx-iq-integrator --type merge \
  -p "{\"data\":{\"dx.config.integrator.mcp_server_list\":\"$LIST,http://orbita-api.dx-shared.svc.cluster.local:9081\"}}"
kubectl -n dx-demo rollout restart deployment/dx-iq-integrator
# Comprobar: tienen que aparecer las herramientas de ÓRBITA
kubectl -n dx-demo logs deploy/dx-iq-integrator | grep Fetched
#  Fetched 26 tools from http://orbita-api.dx-shared.svc.cluster.local:9081
```

En los labs, `scripts/registrar-mcp-en-iq.sh` hace exactamente esto (y no duplica la entrada).

- **Después de cada `helm upgrade` de IQ hay que volver a aplicar el parche**: el chart regenera la lista. Con Helm 4
  ese upgrade necesita además `--force-conflicts`, porque la clave pasa a pertenecer a `kubectl patch`.
- **Probar** en el chat de IQ, con un usuario de la demo: «¿Cuántos días de vacaciones me quedan?» ([más preguntas](docs/preguntas-ia.md)). Cada llamada queda
  auditada en el log de `orbita-api` (`ORBITA MCP auditoria herramienta=… usuario=…`).
- Herramientas y modelo de seguridad: [docs/mcp.md](docs/mcp.md).

### Elegir qué herramientas MCP se publican

Cada definición de herramienta que recibe el Integrator va en el prompt de **cada** llamada al modelo, así que cada
herramienta cuesta tokens (y dinero) aunque no se use. Las 26 de ÓRBITA son unos **4.700 tokens** (las de HCL, unos
30.000). Por defecto se publican todas; para publicar menos, usa `mcp.tools` en tus valores:

```yaml
mcp:
  tools:
    enabled: [vacaciones, fichaje]   # solo estas áreas o herramientas (vacío: todas)
    disabled: [fichar]               # menos estas
    readOnly: false                  # true: solo las 14 de consulta
```

| Área | Herramientas | ≈ tokens |
|---|---|---|
| `general` | quien_soy, resumen_dia, avisos, avisos_marcar_leidos | 470 |
| `fichaje` | fichaje_hoy, fichaje_mes, equipo_ahora, fichar, fichaje_corregir | 960 |
| `vacaciones` | vacaciones_saldo, vacaciones_solicitudes, ausencias_equipo, vacaciones_solicitar, vacaciones_cancelar | 910 |
| `gastos` | gastos_resumen, nota_gasto, nota_gasto_crear, gasto_anadir, nota_gasto_enviar, viaje_solicitar, viaje_cancelar, pagos_pendientes | 1.550 |
| `aprobaciones` | aprobaciones_pendientes, solicitud_resolver, solicitud_comentarios, solicitud_comentar | 780 |
| `readOnly: true` | las 14 de consulta de todas las áreas | 1.860 |

Después de un `helm upgrade` que cambie las herramientas, reinicia el Integrator (`kubectl -n dx-demo rollout restart
deployment/dx-iq-integrator`) para que lea la lista nueva; el log de `orbita-api` dice qué herramientas están activas.

## Actualizar y desinstalar

- **Actualizar**: `helm upgrade orbita oci://ghcr.io/europesip/charts/hcl-dx-orbita --version <nueva> -n dx-shared -f
  orbita-values.yaml`. Las migraciones nuevas se aplican al arrancar y los datos se conservan. Las Script Applications
  se actualizan en sus páginas, y las páginas que ya existen conservan su diseño y los ajustes de cada aplicación.
- **De 2.x a 3.0**: el botón del asistente abre ahora el asistente propio de ÓRBITA, que necesita un LiteLLM
  (`assistant.litellm.*`). Sin LiteLLM, mantén el chat de IQ con `assistant.backend: iq` u oculta el botón con `none`.
  Los avisos creados desde la 3.0 se muestran en el idioma de cada usuario; los anteriores siguen en español.
- **Desinstalar**: `helm -n dx-shared uninstall orbita`. Se quedan la base de datos, su Secret `orbita-db`, las Script
  Applications y las páginas (puede haber páginas que las usen); borra las páginas en DX y la base en PostgreSQL si ya
  no las necesitas. Quita ÓRBITA de la lista de IQ con el mismo parche, sin su URL. También se quedan el theme de ejemplo (`orbita.theme`, WebDAV `OrbitaTheme`) y su colección del DAM `ÓRBITA`.

## Repositorio

```
api/                    back end (Maven, Java 21, Jakarta EE 10)
  rutas.json            contrato de la API REST: método + ruta → operación (lo usan el servidor y la interfaz)
  core/                 lógica (com.europesip.orbita.core): operaciones, permisos, Flyway, demo, sesión de DX
  rest/                 orbita-api.war: API REST (/orbita-api/v1)
  mcp/                  orbita-mcp.war: servidor MCP
web/                    interfaz React (Vite); scripts/scriptapps.mjs genera las 6 Script Applications
images/                 Dockerfiles: orbita-api (Open Liberty) y orbita-scriptapps (las apps construidas)
chart/hcl-dx-orbita/    chart de Helm
scripts/                ayudas para los labs (instalar, verificar, registrar el MCP en IQ)
docs/                   manual ilustrado (PDF, ES/EN), preguntas a la IA, especificación, MCP y pruebas con REST Client
```

## Desarrollo

- **Back end**: `mvn -f api/pom.xml package` (Java 21). **Interfaz**: `cd web && npm ci && npm run build:scriptapps`.
- **Imágenes**: CI construye y prueba las dos imágenes; un push a `main` publica `:main`, un tag `v3.1.0` publica
  `:3.1.0` y el chart.
- **Una operación nueva**: método en `Api.java` (o `Gastos.java`), su ruta en `api/rutas.json`, y la interfaz la llama
  con `api('op', {...})`. **Un cambio de esquema**: un fichero nuevo `V<n>__descripcion.sql` en `db/migration` (nunca
  se edita uno publicado).
- La API responde 401 sin sesión de DX, 422 con `{"error", "aviso": true}` para los errores de negocio y 500 si algo
  falla. WCM elimina `[$…]` al servir el JavaScript: `web/scripts/scriptapps.mjs` lo escribe con escapes equivalentes.
  En Open Liberty, Flyway solo encuentra las migraciones si su carpeta tiene un fichero `flyway.location`.

## Preguntas frecuentes

Dudas habituales sobre instalación, coste y licencia, el theme y el DAM, la IA (también con tu propia IA soberana),
idiomas, seguridad, tecnología y servicios: **[Preguntas frecuentes](docs/faq.es.md)** · [FAQ in English](docs/faq.md).

## Licencia

ÓRBITA es **software libre y de código abierto** con la **[licencia MIT](LICENSE)**: puedes usarlo, copiarlo,
**modificarlo**, distribuirlo y venderlo, también con fines comerciales y en tus propios productos, manteniendo el aviso
de copyright y de licencia. Los componentes de terceros mantienen sus licencias: ver [NOTICE](NOTICE).

## Contacto y servicios

**Aquí tienes todo lo necesario**: el código fuente completo, el chart de Helm y los procedimientos de instalación.
Puedes instalar y usar ÓRBITA por tu cuenta, sin ningún compromiso.

Si quieres ayuda, EUROPESIP, el equipo que hay detrás de ÓRBITA, ofrece servicios **opcionales** a su alrededor:

- **Puesta en marcha**: instalación en tu entorno, revisión de tus requisitos y valores, y una primera sesión de
  traspaso a tu equipo.
- **Personalización y branding**: tu imagen corporativa, nuevas funciones, tus propias reglas (política de
  vacaciones, límites de gastos, flujos de aprobación) e integración con tu tema de DX.
- **Integraciones** con tus sistemas corporativos: Microsoft Teams, CRM, RR. HH. y nómina, ERP, informes y métricas,
  tus propias bases de datos o modelos de IA.
- **Actualizaciones y soporte**: nuevas versiones de ÓRBITA, HCL DX y HCL DX IQ, y soporte con un tiempo de respuesta
  acordado.
- **Bolsas de horas** para cualquiera de lo anterior, que usas cuando las necesites.

📧 [info@europesip.com](mailto:info@europesip.com) · 🌐 [www.europesip.com](https://www.europesip.com)

Copyright © 2026 EUROPESIP.
