#!/usr/bin/env node
// Turns the commits resolve-commits.js pinned, plus the result of validating
// each component, into manifest.json: the record of which commit of which
// repository a run validated, and whether it passed.
//
// Usage: write-manifest.js --commits=commits.json --results=<json> [--out=manifest.json]
//
// --results maps each component to its validation result, e.g.
// {"flow":"success","platform":"failure"}. Exits with 1 unless every
// component succeeded. When run in GitHub Actions, also writes a table to the
// job summary.

const fs = require('fs');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  })
);
const commits = JSON.parse(fs.readFileSync(args.commits || 'commits.json', 'utf8'));
const results = JSON.parse(args.results || '{}');
const out = args.out || 'manifest.json';
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;

const components = {};
for (const [name, commit] of Object.entries(commits)) {
  components[name] = { ...commit, result: results[name] || 'missing' };
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
