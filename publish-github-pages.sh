#!/usr/bin/env bash
# Public GitHub Pages only; no paid service, custom domain, or runtime dependency.
set -euo pipefail

if [[ "${1:-}" != "--publish" ]]; then
  echo 'Usage: bash publish-github-pages.sh --publish'
  echo 'Creates justinhe740-byte/HELLO-FUTURE (public), pushes main, and enables free Pages.'
  exit 0
fi

publish_owner='justinhe740-byte'
publish_repo="$publish_owner/HELLO-FUTURE"
publish_source="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for executable in gh git python3 curl; do
  command -v "$executable" >/dev/null || { echo "Missing tool: $executable" >&2; exit 1; }
done
test -s "$publish_source/index.html"
test -f "$publish_source/.nojekyll"

# Fail before any mutation if API access/authentication is unavailable.
gh api user --jq .login >/dev/null
publish_has_site=false
publish_stage="$(mktemp -d "${TMPDIR:-/tmp}/hello-future-publish.XXXXXXXX")"
trap 'rm -rf -- "$publish_stage"' EXIT

if gh api "repos/$publish_repo" >"$publish_stage/repository.json" 2>"$publish_stage/api-error.txt"; then
  python3 - "$publish_stage/repository.json" <<'PY'
import json, sys
repo = json.load(open(sys.argv[1]))
if repo.get('private') is not False:
    sys.exit('Refusing to publish an existing private repository.')
PY
  # Never replace another project, existing branches, or local-only work.
  publish_refs="$(git ls-remote "https://github.com/$publish_repo.git")"
  if [[ -n "$publish_refs" ]]; then
    git clone --quiet --depth 1 --branch main "https://github.com/$publish_repo.git" "$publish_stage/site"
    python3 - "$publish_source/index.html" "$publish_stage/site" <<'PYVERIFY'
import pathlib, sys
source, site = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
if not (site / '.nojekyll').is_file() or not (site / 'index.html').is_file() or (site / 'index.html').read_bytes() != source.read_bytes():
    sys.exit('Existing repository does not contain this exact website. Refusing to overwrite any files.')
PYVERIFY
    publish_has_site=true
  fi
else
  if [[ "$(<"$publish_stage/api-error.txt")" != *"(HTTP 404)"* ]]; then
    cat "$publish_stage/api-error.txt" >&2
    exit 1
  fi
  gh repo create "$publish_repo" --public --description 'HELLO, FUTURE. A little world imagined by you. A free, private-by-design digital keepsake.'
fi

if [[ "$publish_has_site" == false ]]; then
mkdir "$publish_stage/site"
cp "$publish_source/index.html" "$publish_source/.nojekyll" "$publish_source/README.txt" "$publish_source/TEST-REPORT.md" "$publish_source/publish-github-pages.sh" "$publish_stage/site/"
mkdir "$publish_stage/site/scripts"
cp "$publish_source/scripts/test-mobile.cjs" "$publish_stage/site/scripts/"
git -C "$publish_stage/site" init --initial-branch=main --quiet
git -C "$publish_stage/site" add index.html .nojekyll README.txt TEST-REPORT.md publish-github-pages.sh scripts/test-mobile.cjs
git -C "$publish_stage/site" -c user.name="$publish_owner" -c user.email="$publish_owner@users.noreply.github.com" commit --quiet -m 'Publish HELLO, FUTURE with iPhone keepsake support'
git -C "$publish_stage/site" remote add origin "https://github.com/$publish_repo.git"
git -C "$publish_stage/site" push --set-upstream origin main
fi
if [[ "$(gh api "repos/$publish_repo" --jq .default_branch)" != main ]]; then
  gh api --method PATCH "repos/$publish_repo" -f default_branch=main --silent
fi

if ! gh api "repos/$publish_repo/pages" >"$publish_stage/pages.json" 2>"$publish_stage/pages-error.txt"; then
  if [[ "$(<"$publish_stage/pages-error.txt")" != *"(HTTP 404)"* ]]; then
    cat "$publish_stage/pages-error.txt" >&2
    exit 1
  fi
  cat >"$publish_stage/pages-request.json" <<'JSON'
{"build_type":"legacy","source":{"branch":"main","path":"/"}}
JSON
  gh api --method POST "repos/$publish_repo/pages" --input "$publish_stage/pages-request.json" >"$publish_stage/pages.json"
fi

publish_url="$(python3 - "$publish_stage/pages.json" <<'PY'
import json, sys
url = json.load(open(sys.argv[1])).get('html_url', '')
if url != 'https://justinhe740-byte.github.io/HELLO-FUTURE/':
    sys.exit('Unexpected Pages URL; check GitHub Pages settings before continuing.')
print(url)
PY
)"

# Keep TLS verification on. Verify the published body, not just a successful status code.
for attempt in {1..24}; do
  if curl --fail --silent --show-error --location --max-time 15 "$publish_url" -o "$publish_stage/live.html" 2>"$publish_stage/site-error.txt"; then
    if python3 - "$publish_source/index.html" "$publish_stage/live.html" <<'PY'
import pathlib, sys
sys.exit(0 if pathlib.Path(sys.argv[1]).read_bytes() == pathlib.Path(sys.argv[2]).read_bytes() else 1)
PY
    then
      if [[ "$(gh api "repos/$publish_repo/pages" --jq .https_enforced)" != true ]]; then
        gh api --method PATCH "repos/$publish_repo/pages" -F https_enforced=true --silent
      fi
      echo "Repository: https://github.com/$publish_repo"
      echo "Verified HTTPS website: $publish_url"
      echo 'Real iPhone Safari / WeChat long-press-to-Photos acceptance remains a device check.'
      exit 0
    fi
  fi
  sleep 5
done
echo 'Repository and Pages were configured, but live HTML verification did not finish.' >&2
echo 'Do not report this deployment as verified. Check the Pages build status and retry the HTTPS check.' >&2
exit 1
