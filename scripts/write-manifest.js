#!/usr/bin/env node
// Writes the manifest of one assembled platform snapshot, and the release
// notes body for the GitHub pre-release that carries it.
//
// The manifest is the single source of truth of what a run produced: for each
// component, the exact timestamped snapshot id (the immutable name of the jars
// deployed), the git hash it was built from, and the link to the validation
// run that proves the commit was green. Later automation consumes this file:
// verifying a snapshot contains what it claims, detecting that another writer
// overwrote the -SNAPSHOT alias, computing backport and CVE ranges.
//
// Usage:
//   write-manifest.js --out=DIR \
//     --platform-version=25.4-SNAPSHOT --platform-snapshot-id=... --platform-ref=SHA \
//     --component='{"name":"flow","version":"25.4-SNAPSHOT","snapshotId":"...",
//                   "gitHash":"...","greenEvidence":"url","builtBy":"url"}' [--component=...]

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

function arg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

function args(name) {
  return process.argv
    .filter((a) => a.startsWith(`--${name}=`))
    .map((a) => a.slice(name.length + 3));
}

const out = arg('out', '.');
const platformVersion = arg('platform-version', null);
const platformSnapshotId = arg('platform-snapshot-id', null);
const platformRef = arg('platform-ref', null);
const componentArgs = args('component');
if (!platformVersion || !platformSnapshotId || !platformRef || componentArgs.length === 0) {
  console.error('Missing arguments, see the usage note at the top of this script');
  process.exit(1);
}

const components = {};
for (const spec of componentArgs) {
  const { name, ...component } = JSON.parse(spec);
  components[name] = { repo: `vaadin/${name}`, ...component };
}

const manifest = {
  platformVersion,
  platformSnapshotId,
  created: new Date().toISOString(),
  base: { platformRef },
  components,
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const rows = Object.entries(components)
  .map(([name, c]) => `| ${name} | \`${c.version}\` | \`${c.snapshotId}\` | [\`${c.gitHash.slice(0, 7)}\`](https://github.com/${c.repo}/commit/${c.gitHash}) | [checks](${c.greenEvidence}) |`)
  .join('\n');

const notes = `## Platform snapshot \`${platformSnapshotId}\`

Assembled from the latest green component builds. The alias \`${platformVersion}\` pointed at this build when it was published; the timestamped ids below identify it forever.

| Component | Version | Snapshot id | Commit | Evidence |
|-----------|---------|-------------|--------|----------|
${rows}

### How to use it

\`\`\`xml
<repository>
  <id>vaadin-prereleases</id>
  <url>https://maven.vaadin.com/vaadin-prereleases</url>
  <snapshots><enabled>true</enabled></snapshots>
</repository>

<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.vaadin</groupId>
      <artifactId>vaadin-bom</artifactId>
      <version>${platformVersion}</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
\`\`\`

Add \`-U\` to pick the newest snapshot up, or depend on the timestamped version literally to pin this exact build.
`;

writeFileSync(join(out, 'release-notes.md'), notes);
console.log(JSON.stringify({ manifest: join(out, 'manifest.json'), notes: join(out, 'release-notes.md') }));
