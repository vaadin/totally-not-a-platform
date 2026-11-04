#!/usr/bin/env node
// Points a vaadin/platform versions.json at the components this run built
// from source: every entry a component of config/components.json lists in
// `platformVersions` (as `<section>.<name>`, e.g. `core.flow`) gets
// --version as its javaVersion. Every other entry keeps the version
// Platform pins.
//
// Usage: pin-platform-versions.js --versions=versions.json --version=999.99-SNAPSHOT

const fs = require('fs');
const path = require('path');

function pin(versions, components, version) {
  for (const [name, { platformVersions = [] }] of Object.entries(components)) {
    for (const key of platformVersions) {
      const [section, entry] = key.split('.');
      if (!versions[section] || !versions[section][entry] || !('javaVersion' in versions[section][entry])) {
        throw new Error(`${name}: versions.json has no ${key}.javaVersion`);
      }
      versions[section][entry].javaVersion = version;
    }
  }
  return versions;
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...value] = arg.replace(/^--/, '').split('=');
      return [key, value.join('=')];
    })
  );
  const components = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'components.json'), 'utf8'));
  const versions = JSON.parse(fs.readFileSync(args.versions, 'utf8'));
  fs.writeFileSync(args.versions, JSON.stringify(pin(versions, components, args.version), null, 4) + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { pin };
