// Metro, taught about the workspace.
//
// Two things a monorepo needs and a single-app project does not: the packages
// are outside this folder, so Metro has to watch the repository root or an
// edit to `packages/*` never triggers a reload; and pnpm puts dependencies in
// a store and symlinks them, so both this app's `node_modules` and the root's
// have to be search paths.
//
// `unstable_enableSymlinks` is on by default in this Metro, which is what
// makes pnpm's layout work at all. If a `@stillpoint/*` import ever resolves
// to nothing, that is the flag to check first.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// The packages are ESM with an `exports` map and `.js` specifiers, which is
// what `NodeNext` requires of them. Metro reads `exports` only with this on.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
