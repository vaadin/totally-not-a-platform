const test = require('node:test');
const assert = require('node:assert');
const { resolveComponent } = require('./resolve-commits.js');

const commit = (sha) => ({ sha, html_url: `https://github.com/vaadin/flow/commit/${sha}`, commit: { committer: { date: '2026-11-03T00:00:00Z' } } });
const run = (workflow, sha, conclusion = 'success') => ({ workflow, conclusion, html_url: `https://github.com/vaadin/flow/actions/runs/${sha}` });

// A stub of the GitHub API calls the resolver makes: the commit a ref points
// at, the commit list of a ref, and the runs of a workflow on a commit
// (filtered by conclusion when the request asks for it, as GitHub does).
function github(ref, commits, runs) {
  return async (url) => {
    const { pathname, searchParams } = new URL(url);
    const decoded = decodeURIComponent(pathname);
    let body;
    const workflowRuns = decoded.match(/\/actions\/workflows\/([^/]+)\/runs$/);
    if (workflowRuns) {
      const status = searchParams.get('status');
      body = {
        workflow_runs: (runs[searchParams.get('head_sha')] || []).filter(
          (r) => r.workflow === workflowRuns[1] && (!status || r.conclusion === status)
        ),
      };
    } else if (decoded.endsWith('/commits') && searchParams.get('sha') === ref) {
      body = commits;
    } else if (decoded.endsWith(`/commits/${ref}`)) {
      body = commits[0];
    } else {
      return { ok: false, status: 404, text: async () => `unexpected ${url}` };
    }
    return { ok: true, json: async () => body };
  };
}

const flow = (ref) => ({ repo: 'vaadin/flow', ref, greenWorkflow: 'validation.yml' });

for (const { name, ref, commits, runs, expected } of [
  {
    name: 'the head commit is green',
    ref: 'main',
    commits: [commit('c3'), commit('c2')],
    runs: { c3: [run('validation.yml', 'c3')] },
    expected: 'c3',
  },
  {
    name: 'the newest commits are not validated yet or only ran other workflows',
    ref: 'feature/x',
    commits: [commit('c3'), commit('c2'), commit('c1')],
    runs: { c2: [run('cherry-pick.yml', 'c2')], c1: [run('validation.yml', 'c1')] },
    expected: 'c1',
  },
  {
    name: 'the validation of the newer commit failed',
    ref: 'main',
    commits: [commit('c2'), commit('c1')],
    runs: { c2: [run('validation.yml', 'c2', 'failure')], c1: [run('validation.yml', 'c1')] },
    expected: 'c1',
  },
]) {
  test(`resolves the newest green commit when ${name}`, async () => {
    const resolved = await resolveComponent(flow(ref), github(ref, commits, runs));
    assert.strictEqual(resolved.sha, expected);
    assert.strictEqual(resolved.ref, ref);
    assert.strictEqual(resolved.greenRun, `https://github.com/vaadin/flow/actions/runs/${expected}`);
  });
}

test('fails when an exact ref is not green, instead of using an older commit', async () => {
  const runs = { c1: [run('validation.yml', 'c1')] };
  await assert.rejects(
    resolveComponent({ ...flow('feature/x'), exact: true }, github('feature/x', [commit('c2'), commit('c1')], runs)),
    /vaadin\/flow@feature\/x \(c2\) has not passed validation.yml/
  );
});

test('fails when no commit is green', async () => {
  await assert.rejects(resolveComponent(flow('main'), github('main', [commit('c2'), commit('c1')], {})), /No commit among/);
});

test('resolves a component without greenWorkflow to the commit its ref points at', async () => {
  const ref = 'release/25.4';
  const resolved = await resolveComponent({ repo: 'vaadin/platform', ref }, github(ref, [commit('p1')], {}));
  assert.strictEqual(resolved.sha, 'p1');
  assert.strictEqual(resolved.greenRun, undefined);
});
