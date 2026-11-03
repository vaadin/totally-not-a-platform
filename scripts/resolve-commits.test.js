const test = require('node:test');
const assert = require('node:assert');
const { resolveComponent } = require('./resolve-commits.js');

const commit = (sha) => ({ sha, html_url: `https://github.com/vaadin/flow/commit/${sha}`, commit: { committer: { date: '2026-11-03T00:00:00Z' } } });
const run = (name, sha) => ({ name, html_url: `https://github.com/vaadin/flow/actions/runs/${sha}` });

// A stub of the two GitHub API calls the resolver makes: the commit list of a
// ref, and the successful workflow runs of a commit.
function github(commits, successfulRuns) {
  return async (url) => {
    const { pathname, searchParams } = new URL(url);
    let body;
    if (pathname.endsWith('/actions/runs')) {
      body = { workflow_runs: successfulRuns[searchParams.get('head_sha')] || [] };
    } else if (pathname.endsWith('/commits')) {
      body = commits;
    } else {
      body = commits.find((c) => pathname.endsWith(`/commits/${c.sha}`)) || commits[0];
    }
    return { ok: true, json: async () => body };
  };
}

const flow = { repo: 'vaadin/flow', ref: 'main', greenWorkflow: 'Flow Validation' };

for (const { name, commits, runs, expected } of [
  {
    name: 'the head commit is green',
    commits: [commit('c3'), commit('c2')],
    runs: { c3: [run('Flow Validation', 'c3')] },
    expected: 'c3',
  },
  {
    name: 'the newest commits are not validated yet or only ran other workflows',
    commits: [commit('c3'), commit('c2'), commit('c1')],
    runs: { c2: [run('Cherry Pick', 'c2')], c1: [run('Flow Validation', 'c1')] },
    expected: 'c1',
  },
]) {
  test(`resolves the newest green commit when ${name}`, async () => {
    const resolved = await resolveComponent(flow, github(commits, runs));
    assert.strictEqual(resolved.sha, expected);
    assert.strictEqual(resolved.greenRun, `https://github.com/vaadin/flow/actions/runs/${expected}`);
  });
}

test('fails when no commit is green', async () => {
  await assert.rejects(resolveComponent(flow, github([commit('c2'), commit('c1')], {})), /No commit among/);
});

test('resolves a component without greenWorkflow to the commit its ref points at', async () => {
  const resolved = await resolveComponent({ repo: 'vaadin/platform', ref: 'main' }, github([commit('p1')], {}));
  assert.strictEqual(resolved.sha, 'p1');
  assert.strictEqual(resolved.greenRun, undefined);
});
