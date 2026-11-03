#!/usr/bin/env node
// Pins flow to a given version in a platform versions.json, in place, and
// touches nothing else. Prints the old and new pin as JSON.
//
// Explicit snapshot pins are existing practice in that file (components wait
// for fixes as X.Y-SNAPSHOT), so the platform generator takes the value as is.
// This is deliberately not the generator's --useSnapshots switch, which moves
// every component to snapshots at once: in milestone 1 only flow moves, and
// everything else stays at its pinned release.
//
// Usage: patch-versions.js --file=path/to/versions.json --flow-version=25.4-SNAPSHOT

const { readFileSync, writeFileSync } = require('node:fs');

function arg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

const file = arg('file', null);
const flowVersion = arg('flow-version', null);
if (!file || !flowVersion) {
  console.error('Usage: patch-versions.js --file=versions.json --flow-version=X.Y-SNAPSHOT');
  process.exit(1);
}

const versions = JSON.parse(readFileSync(file, 'utf8'));
if (!versions.core || !versions.core.flow || !versions.core.flow.javaVersion) {
  console.error(`${file} has no core.flow.javaVersion: not a platform versions.json?`);
  process.exit(1);
}

const previous = versions.core.flow.javaVersion;
versions.core.flow.javaVersion = flowVersion;
writeFileSync(file, JSON.stringify(versions, null, 4) + '\n');
console.log(JSON.stringify({ flow: { previous, pinned: flowVersion } }));
