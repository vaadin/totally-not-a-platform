# totally-not-a-platform

Assembles Vaadin from the source of its components. It holds no product code: its workflows check out the component repositories, build them together and record exactly what they built.

## Validate

The [Validate](.github/workflows/validate.yml) workflow:

1. Resolves the ref of every component in [config/components.json](config/components.json) to a commit, once, so every job builds the same commits. Flow resolves to its newest commit on which its own `validation.yml` workflow passed (including runs from the merge queue).
2. Builds each component listed below at its commit against the builds before it, and runs its unit tests.
3. Builds Platform at its commit against those builds (`versions.json` is pointed at them) and runs its unit tests with `mvn install`. No integration tests run: Platform keeps them in the `vaadin-platform-*-test` modules, whose profiles are not enabled. (`mvn test`/`package` cannot build Platform: `vaadin-dev-bundle` unpacks a sibling's jar and the Gradle plugin resolves the bundles from the local repository.) Every component not built here comes in at the version Platform's `versions.json` already pins.
4. Writes `manifest.json`, uploaded as a run artifact, with the commit and result of every component.

Components built from source, in build order:

- Flow: newest green commit, no tests
- Flow Components: against Flow, unit tests with `mvn test`
- TestBench: against Flow, unit tests with `mvn test`
- Hilla: against Flow and TestBench, Java unit tests with `mvn test`
- Browserless Test: against Flow, unit tests with `mvn test`
- Collaboration Engine: against Flow and Flow Components, unit tests with `mvn test`
- Observability Kit: against Flow and TestBench, unit tests with `mvn test`
- Platform: against all of the above

Every component before Platform is built by a call of the reusable [build-component.yml](.github/workflows/build-component.yml), which installs it at `999.99-SNAPSHOT` against the components built before it and hands its artifacts on; a second call, `<component>-unit-tests`, runs its unit tests in parallel with whatever builds on it next. To add a component:

1. Add it to `config/components.json`, with `platformVersions` listing the `versions.json` entries (`<section>.<name>`) Platform should take from its build.
2. Add a `<component>` job (and a `<component>-unit-tests` job) calling `build-component.yml` to `validate.yml`, with the components it builds against as `upstream`, and add the build job to the `needs` of `platform` and both to the `needs` of `manifest`.
3. Add a `<component>-ref` input and pass it on to `resolve-commits.js`.
4. Add a `<component>` job with the same `upstream` to `snapshot.yml`, building with `mvn deploy` into the staging repository, and add it to the `needs` of its `platform` job.

It needs a `VAADIN_PRO_KEY` repository secret (`username/proKey`): Platform's production bundles include the commercial components.

Nothing is published. Run it from the Actions tab, optionally with a branch, tag or commit for any component (`<component>-ref`). An explicit `flow-ref` must itself have passed Flow's validation; leave it empty to take the newest green commit of the configured branch. For example:

```sh
gh workflow run validate.yml -R vaadin/totally-not-a-platform -f flow-components-ref=my-branch
```

Example `manifest.json`:

```json
{
  "created": "2026-11-03T11:09:04.939Z",
  "run": "https://github.com/vaadin/totally-not-a-platform/actions/runs/<id>",
  "result": "success",
  "components": {
    "flow": {
      "repo": "vaadin/flow",
      "ref": "main",
      "sha": "2ffc813272a7592169fb3933fac8816809924dec",
      "date": "2026-11-02T17:34:31Z",
      "url": "https://github.com/vaadin/flow/commit/2ffc813272a7592169fb3933fac8816809924dec",
      "greenRun": "https://github.com/vaadin/flow/actions/runs/41492497135",
      "result": "success"
    },
    "platform": { "...": "..." }
  }
}
```

## Snapshot

The [Snapshot](.github/workflows/snapshot.yml) workflow publishes what a Validate run validated. It starts when a Validate run started for `main` (not for a pull request) passes, or by hand with the ID of such a run:

```sh
gh workflow run snapshot.yml -R vaadin/totally-not-a-platform -f validate-run-id=<run id> -f dry-run=true
```

It reads the commits from that run's `manifest.json` and rebuilds exactly those commits of every component at the Platform version, e.g. `25.4-SNAPSHOT`, in the same order as Validate. No tests run, but the javadoc jars are built. Each component deploys into a staging repository of its own; only when every build has succeeded does the `publish` job merge them, one after the other, into the snapshot repository with `wagon-maven-plugin:merge-maven-repos`, which also merges each `maven-metadata.xml` with the one already there. A Validate run is only published when it ran for `main`, not for a pull request, and validated every component at the ref in `config/components.json`. With `dry-run`, everything is built and staged and nothing is published.

It needs the `MAVEN_SNAPSHOT_DEPLOY_URL` variable and the `SNAPSHOT_USERNAME` / `SNAPSHOT_PASSWORD` secrets, and the `VAADIN_PRO_KEY` secret like Validate. A `workflow_run` trigger only takes effect once the workflow is on the default branch.

The scripts in `scripts/` are plain Node.js without dependencies and can be run locally, e.g. `node scripts/resolve-commits.js`.
