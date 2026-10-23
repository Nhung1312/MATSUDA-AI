import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const reactVersion = require('react/package.json').version;
const domVersion = require('react-dom/package.json').version;

// A successful bundle can still crash before mounting when these versions differ.
if (reactVersion !== domVersion) {
  throw new Error(
    `React version mismatch: react=${reactVersion}, react-dom=${domVersion}. ` +
    'Install the exact matching versions in package.json before deployment.'
  );
}

console.log(`React runtime versions match: ${reactVersion}`);
