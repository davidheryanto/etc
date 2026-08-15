#!/bin/sh
# Copies theme.css and fonts/ from markdown-viewer. Chrome cannot load a shared
# parent directory, so the two extensions duplicate rather than share, the same
# way md2html.mjs duplicates content.js. Run this after retheming there.
#
# Nothing in this folder should edit theme.css: saved.css carries everything
# that belongs to a saved document, so this copy stays a copy.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_dir=$here/../markdown-viewer

printf '%s\n%s\n%s\n\n' \
	"/* DUPLICATED — synced from markdown-viewer/theme.css by sync-theme.sh." \
	"   Do not edit here: edit it there and re-run the script. Styles that" \
	"   belong to a saved page rather than to the Oat look go in saved.css. */" \
	>"$here/theme.css"
cat "$source_dir/theme.css" >>"$here/theme.css"

rm -rf "$here/fonts"
cp -R "$source_dir/fonts" "$here/fonts"

echo "synced theme.css and $(ls "$here/fonts" | wc -l | tr -d ' ') font files"
