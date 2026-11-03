const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const commit = (repo) => ({ repo, ref: 'main', sha: 'a'.repeat(40), url: `https://github.com/${repo}/commit/x` });
const commits = { flow: commit('vaadin/flow'), platform: commit('vaadin/platform') };

for (const { name, results, flow, platform, overall } of [
  {
    name: 'all jobs passed',
    results: { flow: ['success', 'success'], platform: ['success'] },
    flow: 'success',
    platform: 'success',
    overall: 'success',
  },
  {
    name: 'Flow build failed, so its unit tests were skipped',
    results: { flow: ['failure', 'skipped'], platform: ['skipped'] },
    flow: 'failure',
    platform: 'skipped',
    overall: 'failure',
  },
  {
    name: 'a Flow unit test job failed',
    results: { flow: ['success', 'failure'], platform: ['success'] },
    flow: 'failure',
    platform: 'success',
    overall: 'failure',
  },
  {
    name: 'no result for Platform',
    results: { flow: ['success', 'success'] },
    flow: 'success',
    platform: 'missing',
    overall: 'failure',
  },
]) {
  test(`manifest when ${name}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-'));
    const commitsFile = path.join(dir, 'commits.json');
    const out = path.join(dir, 'manifest.json');
    fs.writeFileSync(commitsFile, JSON.stringify(commits));
    const env = { ...process.env, GITHUB_RUN_ID: '', GITHUB_STEP_SUMMARY: '' };

    const run = spawnSync(
      process.execPath,
      [path.join(__dirname, 'write-manifest.js'), `--commits=${commitsFile}`, `--results=${JSON.stringify(results)}`, `--out=${out}`],
      { env }
    );

    const manifest = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.strictEqual(manifest.components.flow.result, flow);
    assert.strictEqual(manifest.components.platform.result, platform);
    assert.strictEqual(manifest.components.flow.sha, commits.flow.sha);
    assert.strictEqual(manifest.result, overall);
    assert.strictEqual(run.status, overall === 'success' ? 0 : 1);
  });
}
