#!/bin/sh
set -e

DIST=./dist-package

rm -rf "$DIST"
mkdir -p "$DIST"
cp -R ./dist "$DIST/dist"
cp ./README.md "$DIST"
cp ./LICENSE "$DIST"

# Derive the published manifest: entry points stay relative to the package
# root, and workspace tooling has no place in the tarball.
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

delete pkg.scripts;
delete pkg.devDependencies;
delete pkg.jest;

fs.writeFileSync('$DIST/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
