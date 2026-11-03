# totally-not-a-platform

Assembles Vaadin from the source of its components. It holds no product code: its workflows check out the component repositories, build them together and record exactly what they built.

## Validate

The [Validate](.github/workflows/validate.yml) workflow:

1. Resolves the ref of every component in [config/components.json](config/components.json) to a commit, once, so every job builds the same commits.
2. Builds Flow at its commit and runs its unit tests, sharded the way Flow's own CI shards them.
3. Builds Platform at its commit against that Flow build (`versions.json` is pointed at it) and runs its unit tests. Every other component comes in at the version Platform's `versions.json` already pins.
4. Writes `manifest.json`, uploaded as a run artifact, with the commit and result of every component.

It needs a `VAADIN_PRO_KEY` repository secret (`username/proKey`): Flow's unit tests and Platform's production bundles include the commercial components.

Nothing is published. Run it from the Actions tab, optionally with a branch, tag or commit for `flow-ref` / `platform-ref`, or:

```sh
gh workflow run validate.yml -R vaadin/totally-not-a-platform -f flow-ref=main
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
      "result": "success"
    },
    "platform": { "...": "..." }
  }
}
```

The scripts in `scripts/` are plain Node.js without dependencies and can be run locally, e.g. `node scripts/resolve-commits.js --flow-ref=main`.
