#!/usr/bin/env bash
# Renders the book to EPUB, PDF (weasyprint) and HTML with pandoc.
#   book/build.sh [en|ru|all] [out-dir]      defaults: all, book/out
# English chapters are book/*.md, Russian ones book/ru/*.md with the same
# names. Output: osg-demo-book-<version>.<lang>.{epub,pdf,html}. The version
# is BOOK_VERSION (the release workflow passes the tag), else git describe;
# the PDF's title page says it with the date, and the EPUB's title carries
# it, so a Kindle library tells the books apart.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
langs=${1:-all}
out=${2:-$here/out}
out=$(mkdir -p "$out" && cd "$out" && pwd)
[ "$langs" = all ] && langs="en ru"
for lang in $langs; do
  case $lang in en|ru) ;; *) echo "usage: book/build.sh [en|ru|all] [out-dir]" >&2; exit 2;; esac
done
cd "$here"
version=${BOOK_VERSION:-$(git describe --tags --always 2>/dev/null || echo dev)}
today=$(date -u +%Y-%m-%d)
# The chapters are the NN-*.md files, in the order of their number prefix; a
# new chapter needs no edit here. Appendix B (91) has no English file of its
# own: it is docs/take-to-system.md, below. Both languages must have the same
# chapters, so neither falls behind unnoticed.
shopt -s nullglob
# one file name per line, regular files only (a directory named NN-x.md is not
# a chapter); names may hold spaces
chapters() { local f; for f in "$1"/[0-9][0-9]-*.md; do [ -f "$f" ] && printf '%s\n' "${f##*/}"; done; return 0; }
mapfile -t names < <({ chapters .; echo 91-take-to-system.md; } | sort -u)
mapfile -t ru_names < <(chapters ru | sort)
if [ "${#names[@]}" -lt 2 ] || [ "${#ru_names[@]}" -lt 2 ]; then
  echo "book/build.sh: no chapters found (book/NN-*.md, book/ru/NN-*.md)" >&2
  exit 1
fi
if [ "$(printf '%s\n' "${names[@]}")" != "$(printf '%s\n' "${ru_names[@]}")" ]; then
  echo "book/build.sh: the English and Russian chapters differ:" >&2
  diff <(printf '%s\n' "${names[@]}") <(printf '%s\n' "${ru_names[@]}") >&2 || true
  exit 1
fi
for lang in $langs; do
  if [ "$lang" = en ]; then
    src=.
    # Appendix B is docs/take-to-system.md with a book title; its links are
    # relative to docs/, so they are rebased to the book folder first.
    sed -e '1s/^# .*/# Appendix B. Take it to a system/' \
        -e 's#](\(\.\./\)\([^)]*\))#](../\2)#g' \
        -e '/](\.\.\//!s#](\([^)#:][^):]*\))#](../docs/\1)#g' ../docs/take-to-system.md > "$out/91-take-to-system.en.md"
  else
    src=$lang
  fi
  files=()
  for n in "${names[@]}"; do
    if [ "$lang" = en ] && [ "$n" = 91-take-to-system.md ]; then files+=("$out/91-take-to-system.en.md")
    else files+=("$src/$n"); fi
  done
  if [ "$lang" = en ]; then stamp="Version $version, $today"; else stamp="Версия $version, $today"; fi
  title=$(sed -n 's/^title: "\(.*\)"$/\1/p' "metadata.$lang.yaml")
  base="$out/osg-demo-book-${version//\//-}.$lang"   # a tag with / stays one file name
  common=(--metadata-file="metadata.$lang.yaml" --lua-filter=pandoc-links.lua \
    --toc --toc-depth=2 --resource-path=".:$src" --highlight-style=tango)
  # the EPUB's title carries the version (a stamp in its date would leave
  # dc:date empty); the HTML and PDF say it under the subtitle
  pandoc "${common[@]}" --metadata title="$title ($version)" -o "$base.epub" "${files[@]}"
  pandoc "${common[@]}" --metadata date="$stamp" --standalone --embed-resources --css=book.css \
    -o "$base.html" "${files[@]}"
  weasyprint -q "$base.html" "$base.pdf"
  echo "book ($lang): $base.{epub,pdf,html}"
done
