// Compile the real API dependency graph, then start it with plain Node ESM.
// No tsx, bundler, custom loader, provider mocks, credentials or Cloud writes.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// An optional path also checks a materialized @vercel/node function artifact.
const artifact = process.argv[2];
const output = artifact ? resolve(artifact) : mkdtempSync(join(root, '.test-verification-esm-'));
const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
assert.equal(config.error, undefined);
const { options } = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, root);
const compiled = new Set();
function compile(source) {
  if (compiled.has(source)) return;
  assert.ok(!relative(root, source).startsWith('..'), 'Local API imports stay inside the source tree');
  compiled.add(source);
  const result = ts.transpileModule(readFileSync(source, 'utf8'), {
    fileName: source, reportDiagnostics: true,
    compilerOptions: { ...options, noEmit: false, module: ts.ModuleKind.ESNext, sourceMap: false },
  });
  assert.ok(!result.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error), 'TypeScript emission succeeds');
  const destination = join(output, relative(root, source).replace(/\.ts$/, '.js'));
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, result.outputText);
  // Trace the emitted runtime imports. Never rewrite their specifiers: that
  // would hide precisely the extensionless-import failure seen on Vercel.
  for (const { fileName } of ts.preProcessFile(result.outputText).importedFiles) {
    if (!fileName.startsWith('.')) continue;
    const target = resolve(dirname(source), fileName);
    const candidates = extname(target) === '.js' ? [target.replace(/\.js$/, '.ts'), target]
      : [target, target + '.ts', join(target, 'index.ts')];
    const next = candidates.find(path => existsSync(path) && /\.(?:ts|js)$/.test(path));
    assert.ok(next, `Source dependency exists: ${fileName}`);
    compile(next);
  }
}

try {
  if (!artifact) {
    compile(join(root, 'api/index.ts'));
    writeFileSync(join(output, 'package.json'), '{"type":"module"}');
    symlinkSync(realpathSync(join(root, 'node_modules')), join(output, 'node_modules'), 'dir');
  }
  assert.ok(existsSync(join(output, 'api/index.js')));
  assert.ok(existsSync(join(output, 'server/verificationPrompts.js')));
  assert.ok(existsSync(join(output, 'src/utils/questionUtils.js')));
  const handler = pathToFileURL(join(output, 'api/index.js')).href;
  const runner = `
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import https from 'node:https';
    import { syncBuiltinESMExports } from 'node:module';
    const nativeFetch = globalThis.fetch;
    let externalAttempts = 0;
    const deny = () => { externalAttempts++; throw Error('External network disabled in native ESM startup check'); };
    https.request = https.get = deny;
    globalThis.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url || input);
      if (url.hostname !== '127.0.0.1') return deny();
      return nativeFetch(input, options);
    };
    syncBuiltinESMExports();
    const { default: handler } = await import(${JSON.stringify(handler)});
    assert.equal(typeof handler, 'function');
    const server = http.createServer((req, res) => {
      req.query = Object.fromEntries(new URL(req.url, 'http://127.0.0.1').searchParams);
      handler(req, res);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    try {
      const health = await fetch(origin + '/api/index?path=health');
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, 'ok');
      const question = { id: 'synthetic-esm-startup', type: 'multiple_choice', question: 'Tính 1+2.',
        options: [{id:'A',text:'2'},{id:'B',text:'3'}], points: 1 };
      for (const phase of ['source', 'independent']) {
        const response = await fetch(origin + '/api/index?path=exam-verification/pass', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({questions:[question], grade:'7', topic:'Toán THCS', phase})
        });
        const data = await response.json();
        assert.equal(response.status, 503, 'Missing test key is a controlled configuration response, not a startup crash');
        assert.equal(data.success, false);
        assert.equal(data.analysisSource, 'unavailable');
        assert.ok(data.requestId);
      }
      assert.equal(externalAttempts, 0, 'No Gemini or Firebase requests');
      console.log('PASS: native Node ESM imports the compiled API; health=200; both verification phases reach the router (503 without a test key); 0 external requests');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `;
  // A clean environment/cwd prevents dotenv or inherited loader options from
  // loading real keys or silently resolving TypeScript during this check.
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', runner], {
    cwd: output, encoding: 'utf8', timeout: 20_000,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', VERCEL: '1', DOTENV_CONFIG_QUIET: 'true' },
  });
  process.stdout.write(result);
} finally {
  if (!artifact) rmSync(output, { recursive: true, force: true });
}
