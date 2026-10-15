// Compatibility entry point; run current handler/service regressions with networking disabled.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, ['--import', './scripts/offline-test-guard.mjs', '--import', 'tsx', 'scripts/check-verification-review.ts'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
