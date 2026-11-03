#!/usr/bin/env node
// Prints the exact timestamped snapshot id an artifact's -SNAPSHOT alias
// currently points at, as JSON: { version, snapshotId, timestamp, buildNumber }.
//
// A Maven snapshot repository stores every deploy of X.Y-SNAPSHOT immutably as
// X.Y-<yyyyMMdd.HHmmss>-<buildNumber> and keeps maven-metadata.xml pointing the
// mutable alias at the newest one. That timestamped id is the only name that
// identifies one concrete set of jars after the alias has moved on, so it is
// what the run manifest records.
//
// Usage: snapshot-id.js --artifact=com.vaadin:flow-server --version=25.4-SNAPSHOT
//        [--repo=https://maven.vaadin.com/vaadin-prereleases]

function arg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

function extract(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1] : null;
}

async function main() {
  const artifact = arg('artifact', null);
  const version = arg('version', null);
  const repo = arg('repo', 'https://maven.vaadin.com/vaadin-prereleases');
  if (!artifact || !version) {
    console.error('Usage: snapshot-id.js --artifact=groupId:artifactId --version=X.Y-SNAPSHOT [--repo=url]');
    process.exit(1);
  }
  const [groupId, artifactId] = artifact.split(':');
  const url = `${repo}/${groupId.replace(/\./g, '/')}/${artifactId}/${version}/maven-metadata.xml`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status}`);
  }
  const xml = await response.text();
  // The <snapshot> block describes the newest deploy; <snapshotVersions> below
  // it repeats the same value per classifier and is not needed here.
  const timestamp = extract(xml, 'timestamp');
  const buildNumber = extract(xml, 'buildNumber');
  if (!timestamp || !buildNumber) {
    throw new Error(`No <snapshot> timestamp/buildNumber in ${url}`);
  }
  console.log(JSON.stringify({
    version,
    snapshotId: `${version.replace(/-SNAPSHOT$/, '')}-${timestamp}-${buildNumber}`,
    timestamp,
    buildNumber: Number(buildNumber),
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
