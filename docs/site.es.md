# Sitio y tema de ÓRBITA

[English](site.md) · **Español**

Desde el chart **4.0.0** (issue #28) un solo `helm install` / `helm upgrade` monta toda la parte de portal de ÓRBITA.
Parte del trabajo «ÓRBITA sobre el tema Simple» de **Macarena** (EUROPESIP), ahora integrado en el chart en lugar de ser
un segundo instalador.

## Qué crea el chart en DX

| | `pages.mode: site` (por defecto) | `pages.mode: home` (la disposición del chart 3.x) |
|---|---|---|
| Páginas | Sitio propio **`/wps/myportal/orbita/`** (etiqueta `orbita-site`): una página por app + página `setting` oculta | Debajo de `pages.parent` (Home), nombres únicos `orbita.<app>`, + página `setting` oculta |
| Tema | `orbita.theme` (WebDAV `OrbitaTheme`) en el sitio | `orbita.theme` en cada página de ÓRBITA |
| Enlaces entre apps | `/wps/myportal/orbita/` | `/wps/myportal/Home/` (o `pages.base`) |

En los dos modos:

- **Tema `orbita.theme`**: copia de la parte estática del tema **Simple** de HCL DX, copiada de **tu** DX al instalar.
  Su `theme.html` se **genera** a partir del `theme.html` de Simple de tu portal más las piezas de ÓRBITA
  (`files/site/theme/parts/`: enlaces del head, cabecera, pie): **ÓRBITA no lleva ningún fichero de HCL**. Si un CF
  cambia los sitios donde van nuestras piezas, el Job se para y dice cuál.
- **Bibliotecas WCM**: `ThemeDS` (plantillas sin flujo de trabajo y los contenidos que llama el tema: colores, logo,
  menú de cabecera, pie, favicon, overrides) y `orbita` (el área **Setting** con logos, colores, pie, copyright y la
  cabecera de ÓRBITA; un área por página; componentes de cabecera y pie), con lectura para todos.
- **Imágenes**: en una colección del DAM `orbita`, o como componentes de imagen WCM si DX no tiene DAM.
- **Página Setting** (`.../setting`, oculta, solo administradores): logos, colores y pie se cambian en DX, sin publicar
  otra versión del chart. El chart rellena un campo **solo si está vacío**: lo que cambies en DX se mantiene en cada
  actualización.

Todo es **idempotente** (solo añade o actualiza, nunca borra): cada `helm upgrade` lo vuelve a ejecutar.

## Valores

```yaml
pages:
  mode: site            # o home: las páginas debajo de Home, como el chart 3.x
  site: { uniqueName: orbita-site, friendly: orbita }
theme:
  enabled: true         # false: sin tema ni contenido WCM (solo páginas)
  libraries: { theme: ThemeDS, content: orbita }
  hclLogo: true         # «Powered by HCL Software» en la cabecera
  assistantButton: true # botón «Pregúntale a ÓRBITA» en la cabecera
  dryRun: false         # true: el Job solo lee DX y escribe lo que cambiaría
```

## Actualizar desde el chart 3.x

- **El valor por defecto pasa a `site`.** Para mantener las páginas debajo de Home, pon **`pages.mode: home`** antes de
  actualizar.
- **El tema se migra**: el tema 3.x (copia de Portal 8.5, el mismo `orbita.theme`) se sustituye por el basado en
  Simple: se reemplazan sus ficheros, se quitan los antiguos y se actualiza el registro (mismo object ID, así que las
  páginas lo conservan).
- Con `site`, las páginas 3.x debajo de Home **se quedan** (no se borra nada): quítalas en DX si no las necesitas.
- La colección del DAM `ÓRBITA` del 3.x se queda; las imágenes nuevas de la cabecera van a la colección `orbita`.
- Valores que desaparecen: `theme.damCollection`, `theme.logoAlt`, `theme.headerBackground`, `pages.layoutTemplate`
  (colores y logos se editan ahora en la página Setting).

## A mano, después de la primera instalación

Con DAM, el log del Job termina con **«TO DO in the portal»**: marca «Mostrar recurso de activo digital» en los cuatro
campos de imagen de la plantilla de área *Setting Site Area - ST* (`desktopLogo`, `mobileLogo`, `footerLogo`,
`favicon`). Ninguna API de DX lo permite.

## Quién mantiene qué

- **Textos del tema y contenido WCM** (sin saber Helm): `chart/hcl-dx-orbita/files/site/`: `theme/parts/*.html`,
  `theme/nls.json` (textos del tema por idioma), `theme/images/`, `wcm/**` (plantillas, contenidos del tema, campos y
  valores del Setting, componentes de cabecera y pie, páginas) y `orbita.config.json`.
- **Los pasos**: `chart/hcl-dx-orbita/files/sitio.mjs` (lo ejecuta `after-push.sh` en el Job de scriptapps).
