# ÓRBITA's site and theme

**English** · [Español](site.es.md)

Since chart **4.0.0** (issue #28) one `helm install` / `helm upgrade` builds the whole portal part of ÓRBITA. Based on
the "ÓRBITA on the Simple theme" work by **Macarena** (EUROPESIP), now integrated in the chart instead of being a
second installer.

## What the chart creates in DX

| | `pages.mode: site` (default) | `pages.mode: home` (the layout of chart 3.x) |
|---|---|---|
| Pages | Own site **`/wps/myportal/orbita/`** (label `orbita-site`): one page per app + hidden `setting` page | Below `pages.parent` (Home), unique names `orbita.<app>`, + hidden `setting` page |
| Theme | `orbita.theme` (WebDAV `OrbitaTheme`) on the site | `orbita.theme` on each ÓRBITA page |
| Links between the apps | `/wps/myportal/orbita/` | `/wps/myportal/Home/` (or `pages.base`) |

In both modes:

- **Theme `orbita.theme`**: a copy of the static part of the HCL DX **Simple** theme, copied from **your** DX at install
  time. Its `theme.html` is **generated** from the Simple `theme.html` of your portal plus ÓRBITA's parts
  (`files/site/theme/parts/`: head links, header, footer): **no HCL file ships with ÓRBITA**. If a CF changes the
  places our parts go, the Job stops and says which one.
- **WCM libraries**: `ThemeDS` (authoring templates without workflow and the contents the theme calls: colors, logo,
  header menu, footer, favicon, overrides) and `orbita` (the **Setting** site area with logos, colors, footer,
  copyright and the ÓRBITA header; one site area per page; header and footer components), readable by everybody.
- **Images**: in a DAM collection `orbita`, or as WCM image components when DX has no DAM.
- **Setting page** (`.../setting`, hidden, administrators only): change logos, colors and footer in DX, without a new
  chart release. The chart fills a field **only when it is empty**: what you change in DX is kept on every upgrade.

Everything is **idempotent** (only adds or updates, never deletes): every `helm upgrade` runs it again.

## Values

```yaml
pages:
  mode: site            # or home: the pages below Home, as chart 3.x
  site: { uniqueName: orbita-site, friendly: orbita }
theme:
  enabled: true         # false: no theme and no WCM content (pages only)
  libraries: { theme: ThemeDS, content: orbita }
  hclLogo: true         # "Powered by HCL Software" in the header
  assistantButton: true # "Ask ÓRBITA" button in the header
  dryRun: false         # true: the Job only reads DX and logs what it would change
```

## Upgrading from chart 3.x

- **The default changes to `site`.** To keep the pages below Home, set **`pages.mode: home`** before upgrading.
- **The theme is migrated**: the 3.x theme (a copy of Portal 8.5, same `orbita.theme`) is replaced by the Simple-based
  one: its files are replaced, the old ones removed, the registration updated (same object ID, so the pages keep it).
- With `site`, the 3.x pages below Home **stay** (nothing is deleted) and keep working with the new theme, but without
  the ÓRBITA header TOP (they have no site area in the `orbita` library): remove them in DX if you do not need them.
- The 3.x DAM collection `ÓRBITA` stays; the new header images go to the collection `orbita`.
- Removed values: `theme.damCollection`, `theme.logoAlt`, `theme.headerBackground`, `pages.layoutTemplate` (colors and
  logos are now edited in the Setting page).

## By hand, after the first install

With DAM, the Job log ends with **"TO DO in the portal"**: tick "Show digital asset resource" in the four image fields
of the site area template *Setting Site Area - ST* (`desktopLogo`, `mobileLogo`, `footerLogo`, `favicon`). No DX API
can set it.

## Who maintains what

- **Theme texts and WCM content** (no Helm knowledge needed): `chart/hcl-dx-orbita/files/site/`: `theme/parts/*.html`,
  `theme/nls.json` (theme texts per language), `theme/images/`, `wcm/**` (templates, theme setting contents, Setting
  fields and defaults, header and footer components, pages) and `orbita.config.json`.
- **The steps**: `chart/hcl-dx-orbita/files/sitio.mjs` (run by `after-push.sh` in the scriptapps Job).
