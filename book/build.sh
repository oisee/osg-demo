#!/usr/bin/env bash
# Renders the book to EPUB and PDF with pandoc (and weasyprint for the PDF).
#   book/build.sh [out-dir]      default: book/out
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$here/out}
out=$(mkdir -p "$out" && cd "$out" && pwd)
cd "$here"
# Appendix B is docs/take-to-system.md with a book title; its links are
# relative to docs/, so they are rebased to the book folder first.
sed -e '1s/^# .*/# Appendix B. Take it to a system/' \
    -e 's#](\(\.\./\)\([^)]*\))#](../\2)#g' \
    -e '/](\.\.\//!s#](\([^)#:][^):]*\))#](../docs/\1)#g' ../docs/take-to-system.md > "$out/91-take-to-system.md"
chapters=(00-preface.md 01-hello.md 02-debug-tests-dumps.md 03-odata.md 04-fiori.md 05-cds.md \
  06-amdp.md 07-take-to-system.md 08-business-log.md 09-background-jobs.md 10-generated-code.md \
  11-lift.md 90-run-the-checks.md "$out/91-take-to-system.md" 92-limits-glossary.md)
common=(--metadata-file=metadata.yaml --lua-filter=pandoc-links.lua --toc --toc-depth=2)
pandoc "${common[@]}" -o "$out/osg-demo-book.epub" "${chapters[@]}"
pandoc "${common[@]}" --standalone --embed-resources --css=book.css -o "$out/osg-demo-book.html" "${chapters[@]}"
weasyprint "$out/osg-demo-book.html" "$out/osg-demo-book.pdf"
echo "book: $out/osg-demo-book.epub, $out/osg-demo-book.pdf, $out/osg-demo-book.html"
