import { describe as describeSuite, expect, it } from 'vitest';
import { describe as describePackage, name, version } from './index.js';

describeSuite('describe()', () => {
  it('reports the package name and version', () => {
    expect(describePackage()).toEqual({ name, version });
  });

  it('reports a semver-shaped version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
