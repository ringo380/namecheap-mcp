import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// dist/version.js and src/version.ts are both one directory below package.json,
// so this relative path resolves correctly whether we run compiled or under tsx.
const pkg = require('../package.json');
export const VERSION = pkg.version;
//# sourceMappingURL=version.js.map