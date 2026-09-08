#!/usr/bin/env bash
set -euo pipefail

prefix="${1:-v}"
case "$prefix" in
  v|qa) ;;
  *) echo "Usage: $0 [v|qa]" >&2; exit 2 ;;
esac

git fetch origin --tags
latest="$({ git tag --list "${prefix}[0-9]*.[0-9]*.[0-9]*" || true; } | sort -V | tail -1)"
if [[ -z "$latest" ]]; then
  version="0.1.0"
else
  version="${latest#${prefix}}"
  IFS=. read -r major minor patch <<< "$version"
  version="${major}.${minor}.$((patch + 1))"
fi

if [[ "$prefix" == "v" ]]; then
  perl -0pi -e "s/^version: .*/version: ${version}/m; s/^appVersion: .*/appVersion: \"${version}\"/m" \
    infra/helm/dzine-canvas/Chart.yaml
  if ! git diff --quiet -- infra/helm/dzine-canvas/Chart.yaml; then
    git add infra/helm/dzine-canvas/Chart.yaml
    git commit -m "chore(release): sync helm chart ${version}"
    git push origin "HEAD:${GITHUB_REF_NAME:-main}"
  fi
fi

tag="${prefix}${version}"
git tag "$tag"
git push origin "$tag"
echo "Created ${tag}"
