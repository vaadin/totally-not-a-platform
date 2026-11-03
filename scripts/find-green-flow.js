#!/usr/bin/env node
// Finds the newest commit on a branch whose CI verdict is green, and prints it
// as JSON: { sha, shortSha, date, checksUrl }.
//
// "Green" means: the sentinel check-run (the aggregate job the repository's
// validation workflow ends with) completed successfully, and every other
// completed GitHub Actions check-run on the commit concluded success, skipped
// or neutral. A commit with no sentinel check never counts as green: direct
// pushes and bot commits carry no validation run at all, and mistaking them
// for green would defeat the whole point. A commit whose checks are still
// running is not green yet, so the search moves on to older commits, which is
// the correct semantics for "latest green".
//
// vaadin/flow validates through the merge queue (validation.yml runs on
// merge_group, not on push to main). The merge group's head commit is the
// commit that lands on main, so the check-runs created by the queue run are
// attached to the SHA main ends up carrying.
//
// Usage: find-green-flow.js [--component=flow] [--max=30]
// Requires GITHUB_TOKEN (or GH_TOKEN) in the environment.

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const GOOD_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

function arg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN or GH_TOKEN must be set');
  process.exit(1);
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function checkRuns(repo, sha) {
  // One page of 100 covers flow's matrix today (about 30 jobs); the loop is
  // for the day it does not.
  const runs = [];
  for (let page = 1; ; page++) {
    const data = await api(`/repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`);
    runs.push(...data.check_runs);
    if (runs.length >= data.total_count || data.check_runs.length === 0) {
      return runs;
    }
  }
}

function verdict(runs, sentinel) {
  // Only GitHub Actions check-runs count: other apps (code scanners, bots)
  // report onto the same commit but say nothing about the build.
  const actions = runs.filter((run) => run.app && run.app.slug === 'github-actions');
  const sentinelRuns = actions.filter((run) => run.name === sentinel);
  if (sentinelRuns.length === 0) {
    return 'no-validation';
  }
  if (actions.some((run) => run.status !== 'completed')) {
    return 'in-progress';
  }
  // A re-run leaves several check-runs with the same name on the commit; the
  // API lists the latest attempt first, so judge each name by its first entry.
  const latestByName = new Map();
  for (const run of actions) {
    if (!latestByName.has(run.name)) {
      latestByName.set(run.name, run);
    }
  }
  // The sentinel itself must have succeeded outright: a skipped aggregate job
  // says nothing about the tests it aggregates.
  if (latestByName.get(sentinel).conclusion !== 'success') {
    return 'red';
  }
  for (const run of latestByName.values()) {
    if (!GOOD_CONCLUSIONS.has(run.conclusion)) {
      return 'red';
    }
  }
  return 'green';
}

async function main() {
  const component = arg('component', 'flow');
  const max = Number(arg('max', '30'));
  const config = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'components.json'), 'utf8'));
  const { repo, ref, sentinelCheck } = config[component];

  const commits = await api(`/repos/${repo}/commits?sha=${ref}&per_page=${max}`);
  for (const commit of commits) {
    const runs = await checkRuns(repo, commit.sha);
    const result = verdict(runs, sentinelCheck);
    console.error(`${commit.sha.slice(0, 7)} ${result} (${commit.commit.message.split('\n')[0].slice(0, 72)})`);
    if (result === 'green') {
      console.log(JSON.stringify({
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        date: commit.commit.committer.date,
        checksUrl: `https://github.com/${repo}/commit/${commit.sha}/checks`,
      }));
      return;
    }
  }
  console.error(`No green commit found in the newest ${max} commits of ${repo}@${ref}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
