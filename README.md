# totally-not-a-platform

A prototype build orchestrator for the Vaadin platform: from ready code to a validated platform snapshot in one pipeline run. The long term goal is "from ready code to release in an hour"; this repo starts by making the snapshot half of that path fast, green and auditable.

## What it does (milestone 1: platform + flow)

One workflow, `assemble.yml`, on manual dispatch:

1. **Resolve**: find the newest commit on `vaadin/flow` main whose validation verdict is green. Flow validates through the merge queue, so the check-runs of the merge group are attached to the exact SHA that lands on main. A commit with no validation run (direct push, bot commit) never counts as green.
2. **Build flow**: check out that commit and build it as the regular `25.4-SNAPSHOT`, skipping tests, because they already passed in the merge queue for this exact SHA.
3. **Assemble platform**: check out `vaadin/platform` main, pin flow to `25.4-SNAPSHOT` in `versions.json`, generate the BOM set, build it against the just-built flow, run the platform's fast validations.

Nothing is deployed yet: the flow artifacts travel between the jobs as a workflow artifact, and the platform resolves them from the local Maven repository. Once this validation pipeline has proven itself, the next step is deploying both to the snapshot repository, replacing the TeamCity flow and platform snapshot builds: existing consumers of `25.4-SNAPSHOT` then notice nothing, except that every snapshot was built from a commit whose full test suite passed.

## Traceability: the manifest (once deploys are enabled)

`-SNAPSHOT` versions are mutable aliases. Every deploy is stored immutably by Maven as `25.4-<yyyyMMdd.HHmmss>-<n>`, and the repository metadata points the alias at the newest one. The manifest written by each deploying run records that timestamped id next to the git hash and the link to the green validation run:

```json
{ "platformVersion": "25.4-SNAPSHOT",
  "platformSnapshotId": "25.4-20261103.150210-18",
  "components": { "flow": { "version": "25.4-SNAPSHOT",
                            "snapshotId": "25.4-20261103.143000-42",
                            "gitHash": "...", "greenEvidence": "...", "builtBy": "..." } } }
```

That one file is what makes the later automation mechanical: verifying a snapshot contains what it claims, detecting that another writer overwrote the alias, knowing exactly which commits a given platform build carries for backports and CVE ranges.

## Scripts

All scripts are plain Node.js with no npm dependencies.

| Script | Purpose |
|--------|---------|
| `scripts/find-green-flow.js` | Resolve the newest green commit of a component (`--component=flow`, needs `GITHUB_TOKEN`) |
| `scripts/snapshot-id.js` | Read the exact timestamped snapshot id of an artifact from the repository metadata |
| `scripts/patch-versions.js` | Pin flow to `X.Y-SNAPSHOT` in platform's `versions.json` |
| `scripts/write-manifest.js` | Emit `manifest.json` and the release notes body for a run |

## Running it

```
gh workflow run assemble.yml --ref <branch>
```

Inputs: `flow-ref` builds an explicit vaadin/flow commit instead of resolving the latest green one, and `platform-ref` picks the vaadin/platform ref to assemble from (default `main`). When the resolved flow commit is already the one in `manifests/latest.json`, the run is a no-op, which is what will make a cron trigger cheap.

## Required configuration

None while deploying is disabled: the pipeline runs on the default `GITHUB_TOKEN`. Enabling deploys will need the same pattern as flow's `pr-snapshot.yml`:

- Variable `MAVEN_SNAPSHOT_DEPLOY_URL`: the deploy endpoint of the snapshot repository.
- Secrets `SNAPSHOT_USERNAME` and `SNAPSHOT_PASSWORD`: credentials allowed to deploy there.

Artifacts are then read back from `https://maven.vaadin.com/vaadin-prereleases`.

## Notes for the production path

- **Deploy on green in the component repos.** Today this orchestrator rebuilds flow at the green SHA (tests skipped). The refinement is a workflow in `vaadin/flow` that deploys the moment a merge group passes: artifacts then exist before this pipeline starts, and the build job here collapses into a lookup.
- **Dual writers.** Until the TeamCity flow and platform snapshot builds are switched off, both publish the same `-SNAPSHOT` alias and the last writer wins the metadata. The manifest's timestamped ids keep every run of this pipeline identifiable regardless.
- **Phase 2.** flow-components (unit tests only), hilla (TS and Java) and web components join as further resolve/build jobs; `config/components.json` and the manifest are already plural. The AI agents (backport detection, requesting missing releases, release content verification, CVE announcements) are separate workflows consuming `manifests/`.
