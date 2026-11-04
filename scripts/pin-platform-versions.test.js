const test = require('node:test');
const assert = require('node:assert');
const { pin } = require('./pin-platform-versions.js');

test('pins the listed entries and leaves the others alone', () => {
  const versions = {
    core: { flow: { javaVersion: '25.4.0-alpha4' }, 'flow-components': { javaVersion: '{{version}}' }, hilla: { javaVersion: '25.4.0-alpha4' } },
    vaadin: { 'vaadin-testbench': { javaVersion: '25.4.0-alpha1' } },
  };
  const components = {
    flow: { platformVersions: ['core.flow'] },
    'flow-components': { platformVersions: ['core.flow-components'] },
    testbench: { platformVersions: ['vaadin.vaadin-testbench'] },
    platform: {},
  };

  pin(versions, components, '999.99-SNAPSHOT');

  assert.deepStrictEqual(versions, {
    core: { flow: { javaVersion: '999.99-SNAPSHOT' }, 'flow-components': { javaVersion: '999.99-SNAPSHOT' }, hilla: { javaVersion: '25.4.0-alpha4' } },
    vaadin: { 'vaadin-testbench': { javaVersion: '999.99-SNAPSHOT' } },
  });
});

test('fails on an entry versions.json does not have', () => {
  assert.throws(() => pin({ core: {} }, { flow: { platformVersions: ['core.flow'] } }, 'x'), /flow: versions.json has no core.flow.javaVersion/);
});
