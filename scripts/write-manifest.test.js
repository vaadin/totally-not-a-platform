const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const commit = (repo) => ({ repo, ref: 'main', sha: 'a'.repeat(40), url: `https://github.com/${repo}/commit/x` });
const commits = { flow: commit('vaadin/flow'), platform: commit('vaadin/platform') };

for (const { name, needs, flow, platform, overall } of [
  {
    name: 'every component passed',
    needs: { resolve: { result: 'success' }, flow: { result: 'success' }, platform: { result: 'success' } },
    flow: 'success',
    platform: 'success',
    overall: 'success',
  },
  {
    name: 'Flow failed, so Platform was skipped',
    needs: { flow: { result: 'failure' }, platform: { result: 'skipped' } },
    flow: 'failure',
    platform: 'skipped',
    overall: 'failure',
  },
  {
    name: 'the unit tests of Flow failed',
    needs: { flow: { result: 'success' }, 'flow-unit-tests': { result: 'failure' }, platform: { result: 'success' } },
    flow: 'failure',
    platform: 'success',
    overall: 'failure',
  },
  {
    name: 'no job for Platform',
    needs: { flow: { result: 'success' } },
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
      [path.join(__dirname, 'write-manifest.js'), `--commits=${commitsFile}`, `--needs=${JSON.stringify(needs)}`, `--out=${out}`],
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
