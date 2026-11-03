#!/usr/bin/env node
// Resolves the ref of every component in config/components.json to the
// commit it points at right now, so all later jobs build exactly that commit.
//
// Usage: resolve-commits.js [--<component>-ref=<ref> ...] [--out=commits.json]
//
// An empty --<component>-ref falls back to the ref in the config. Writes the
// resolved commits as JSON to --out and, when run in GitHub Actions, one
// `<component>-sha` output per component.

const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  })
);
const configFile = path.join(__dirname, '..', 'config', 'components.json');
const components = JSON.parse(fs.readFileSync(configFile, 'utf8'));
const out = args.out || 'commits.json';

async function resolve(repo, ref) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Cannot resolve ${repo}@${ref}: ${response.status} ${await response.text()}`);
  }
  const commit = await response.json();
  return { sha: commit.sha, date: commit.commit.committer.date, url: commit.html_url };
}

async function main() {
  const commits = {};
  for (const [name, { repo, ref: defaultRef }] of Object.entries(components)) {
    const ref = args[`${name}-ref`] || defaultRef;
    commits[name] = { repo, ref, ...(await resolve(repo, ref)) };
    console.log(`${name}: ${repo}@${ref} -> ${commits[name].sha}`);
  }
  fs.writeFileSync(out, JSON.stringify(commits, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) {
    const lines = Object.entries(commits).map(([name, { sha }]) => `${name}-sha=${sha}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join(''));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
