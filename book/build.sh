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
names=(00-preface.md 01-hello.md 02-debug-tests-dumps.md 03-odata.md 04-fiori.md 05-cds.md \
  06-amdp.md 07-take-to-system.md 08-business-log.md 09-background-jobs.md 10-generated-code.md \
  11-lift.md 12-rules.md 13-trace.md 14-cli.md 15-vscode.md 90-run-the-checks.md 91-take-to-system.md 92-limits-glossary.md)
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
  base="$out/osg-demo-book-$version.$lang"
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
