#!/usr/bin/env bash
# scripts/github-labels.sh · creates (or updates) the labels of the work model described in docs/workflow.md.
# Usage: scripts/github-labels.sh [owner/repo]   (default: europesip/orbita). Needs gh with repo scope.
set -euo pipefail
R="${1:-europesip/orbita}"
l(){ gh label create "$1" -R "$R" --color "$2" --description "$3" --force; }
# Type
l bug            CF222E "Something does not behave as it should"
l tech-debt      E36209 "A shortcut taken on purpose, to be paid back"
l enhancement    1A7F37 "A new capability, option or use case"
l blocked        6F42C1 "Depends on another task or on something external"
l documentation  0075CA "Documentation or architecture"
# Area
l area:web         BF8700 "Area: Script Applications and theme (web/)"
l area:api         0969DA "Area: REST API and business logic (api/)"
l area:ai          BF3989 "Area: assistant and MCP server"
l area:packaging   5B6CFF "Area: Helm chart, images and CI"
l area:demo-data   0E8A8A "Area: demo users, data and pages"
# Priority
l P1 B60205 "High priority"
l P2 FBCA04 "Medium priority"
l P3 A2EEEF "Low priority"
