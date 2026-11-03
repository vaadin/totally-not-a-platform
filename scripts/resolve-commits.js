#!/usr/bin/env node
// Resolves the ref of every component in config/components.json to a commit,
// once, so all later jobs build exactly that commit.
//
// Usage: resolve-commits.js [--<component>-ref=<ref> ...] [--out=commits.json]
//
// An empty --<component>-ref falls back to the ref in the config. A component
// with a `greenWorkflow` (a workflow file of its own repository, e.g.
// `validation.yml`) resolves to the newest commit at or before its ref on
// which that workflow succeeded, so it does not need to be tested again; the
// run is recorded as `greenRun`, and a warning is printed when that is not
// the commit the ref points at. Any other component resolves to the commit
// its ref points at.
//
// Writes the resolved commits as JSON to --out and, when run in GitHub
// Actions, one `<component>-sha` output per component.

const fs = require('fs');
const path = require('path');

// How far back to look for a green commit before giving up.
const MAX_COMMITS = 30;

async function api(apiPath, fetchImpl = fetch) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetchImpl(`https://api.github.com${apiPath}`, { headers });
  if (!response.ok) {
    throw new Error(`GET ${apiPath} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function describe(commit) {
  return { sha: commit.sha, date: commit.commit.committer.date, url: commit.html_url };
}

// A successful run of `workflow` on `sha`, if any. A commit validated
// through the merge queue carries the queue's run: the merge group's head
// commit is the one that lands on the branch.
async function greenRun(repo, sha, workflow, fetchImpl) {
  const { workflow_runs: runs } = await api(
    `/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?head_sha=${sha}&status=success&per_page=1`,
    fetchImpl
  );
  return runs.find((run) => run.conclusion === 'success');
}

async function resolveComponent({ repo, ref, greenWorkflow }, fetchImpl = fetch) {
  const encodedRef = encodeURIComponent(ref);
  if (!greenWorkflow) {
    return { repo, ref, ...describe(await api(`/repos/${repo}/commits/${encodedRef}`, fetchImpl)) };
  }
  const commits = await api(`/repos/${repo}/commits?sha=${encodedRef}&per_page=${MAX_COMMITS}`, fetchImpl);
  for (const commit of commits) {
    const run = await greenRun(repo, commit.sha, greenWorkflow, fetchImpl);
    if (run) {
      if (commit !== commits[0]) {
        console.log(`::warning::${repo}@${ref} is at ${commits[0].sha.slice(0, 10)}, which has not passed ${greenWorkflow}; using ${commit.sha.slice(0, 10)}, the newest commit before it that has`);
      }
      return { repo, ref, ...describe(commit), greenRun: run.html_url };
    }
    console.error(`${repo}@${commit.sha.slice(0, 10)}: no successful ${greenWorkflow} run, trying the commit before`);
  }
  throw new Error(`No commit among the newest ${MAX_COMMITS} of ${repo}@${ref} has a successful ${greenWorkflow} run`);
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...value] = arg.replace(/^--/, '').split('=');
      return [key, value.join('=')];
    })
  );
  const configFile = path.join(__dirname, '..', 'config', 'components.json');
  const components = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const out = args.out || 'commits.json';

  const commits = {};
  for (const [name, component] of Object.entries(components)) {
    const ref = args[`${name}-ref`] || component.ref;
    commits[name] = await resolveComponent({ ...component, ref });
    console.log(`${name}: ${component.repo}@${ref} -> ${commits[name].sha}`);
  }
  fs.writeFileSync(out, JSON.stringify(commits, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(commits).map(([name, { sha }]) => `${name}-sha=${sha}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join(''));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { resolveComponent };
