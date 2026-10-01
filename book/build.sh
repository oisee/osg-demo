#!/usr/bin/env bash
# Renders the book to EPUB, PDF (weasyprint) and HTML with pandoc.
#   book/build.sh [en|ru|all] [out-dir]      defaults: all, book/out
# English chapters are book/*.md, Russian ones book/ru/*.md with the same
# names. Output: osg-demo-book.<lang>.{epub,pdf,html}.
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
names=(00-preface.md 01-hello.md 02-debug-tests-dumps.md 03-odata.md 04-fiori.md 05-cds.md \
  06-amdp.md 07-take-to-system.md 08-business-log.md 09-background-jobs.md 10-generated-code.md \
  11-lift.md 90-run-the-checks.md 91-take-to-system.md 92-limits-glossary.md)
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
  common=(--metadata-file="metadata.$lang.yaml" --lua-filter=pandoc-links.lua --toc --toc-depth=2 \
    --resource-path=".:$src" --highlight-style=tango)
  pandoc "${common[@]}" -o "$out/osg-demo-book.$lang.epub" "${files[@]}"
  pandoc "${common[@]}" --standalone --embed-resources --css=book.css -o "$out/osg-demo-book.$lang.html" "${files[@]}"
  weasyprint -q "$out/osg-demo-book.$lang.html" "$out/osg-demo-book.$lang.pdf"
  echo "book ($lang): $out/osg-demo-book.$lang.{epub,pdf,html}"
done
