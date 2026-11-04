#!/usr/bin/env node
// Turns the commits resolve-commits.js pinned, plus the result of validating
// each component, into manifest.json: the record of which commit of which
// repository a run validated, and whether it passed.
//
// Usage: write-manifest.js --commits=commits.json --needs=<json> [--out=manifest.json]
//
// --needs is the workflow's `needs` context as JSON. A component is
// validated by the job named after it, plus `<component>-unit-tests` where
// there is one, e.g. {"flow":{"result":"success"}}; it succeeds only when
// all of them did. Exits with 1 unless every component succeeded. When run in GitHub Actions, also writes a table to the
// job summary.

const fs = require('fs');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  })
);
const commits = JSON.parse(fs.readFileSync(args.commits || 'commits.json', 'utf8'));
const needs = JSON.parse(args.needs || '{}');
const out = args.out || 'manifest.json';
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;

// The first result of the component's jobs that is not a success, so a
// failed build reports `failure` rather than the `skipped` of its tests.
function componentResult(name) {
  const results = [name, `${name}-unit-tests`].filter((job) => needs[job]).map((job) => needs[job].result);
  if (results.length === 0) {
    return 'missing';
  }
  return results.find((result) => result !== 'success') || 'success';
}

const components = {};
for (const [name, commit] of Object.entries(commits)) {
  components[name] = { ...commit, result: componentResult(name) };
}
const manifest = {
  created: new Date().toISOString(),
  run: GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null,
  result: Object.values(components).every((c) => c.result === 'success') ? 'success' : 'failure',
  components,
};
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(components).map(
    ([name, c]) => `| ${name} | ${c.repo}@${c.ref} | [\`${c.sha.slice(0, 10)}\`](${c.url}) | ${c.result} |`
  );
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ['## Validation: ' + manifest.result, '', '| Component | Ref | Commit | Result |', '|---|---|---|---|', ...rows, ''].join('\n')
  );
}
process.exit(manifest.result === 'success' ? 0 : 1);
