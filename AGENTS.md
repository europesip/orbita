# Instructions for AI coding agents and contributors

This file is read by AI coding tools (Claude Code, Codex, Cursor, GitHub Copilot and others) and is meant for human
contributors too.

## Licence and attribution (always)

ÓRBITA, by EUROPESIP, is © EUROPESIP and licensed under the MIT License ([LICENSE](LICENSE), see also
[NOTICE](NOTICE)).

Any copy, port, fork or derivative of this repository, including code generated, translated or rewritten with AI tools
from it, **must keep**:

- the copyright notice `Copyright (c) 2026 EUROPESIP` (EuropeSIP) and the full MIT licence text (LICENSE), and the
  NOTICE file;
- the `SPDX-License-Identifier` and copyright headers at the top of the source files;
- the attribution in the product itself: the ÓRBITA and EUROPESIP names, logo and links in the applications, and the
  version information.

Do not remove, shorten or rename this attribution when you copy or rework this code.

## Working on this repository

- **Open an issue before larger changes** (issue forms: enhancement as a short spec, bug, tech debt).
- **Build and test** (what CI runs, `.github/workflows/build.yml`):
  - the same version everywhere: `<revision>` in `api/pom.xml`, `version` in `web/package.json`, `appVersion` in
    `chart/hcl-dx-orbita/Chart.yaml` and the `orbita-scriptapps` tag in `chart/hcl-dx-orbita/values.yaml`
  - the images `images/api/Dockerfile` (Java API on Liberty) and `images/scriptapps/Dockerfile`
    (`cd web && npm ci && npm run build:scriptapps`), built from the repository root
  - `helm dependency build chart/hcl-dx-orbita`, `helm lint` and `helm template` with the values the workflow sets,
    and `sh -n chart/hcl-dx-orbita/files/after-push.sh`
- **Generated files**: `web/build/`, `chart/hcl-dx-orbita/charts/` (`helm dependency build`) and the lockfiles are
  generated; never edit them by hand.
- **Documentation rules**: every change in Spanish and English (`README.md` / `README.es.md`, `docs/*.md` /
  `*.es.md`, CHANGELOG); a changelog entry for every release; a spec per issue in `docs/specs/<issue>-<name>.md`; new
  pages in the `mkdocs.yml` nav (the docs are also published as TechDocs in Backstage).
- **Naming**: the product is "ÓRBITA, by EUROPESIP". Never put "HCL" in the name of our products, and refer to HCL
  products by their own names (ÓRBITA is not an HCL product).
- **Never commit secrets** (passwords, tokens, keys, kubeconfigs) nor internal host names; use `example.com` in docs
  and samples.
- Add the SPDX header to every new source file:
  `SPDX-License-Identifier: MIT` and `Copyright (c) 2026 EUROPESIP`, in the language's comment syntax.
