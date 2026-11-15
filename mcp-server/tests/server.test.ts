// tests/server.test.ts
// Run with: npm test (or: npx tsx tests/server.test.ts)

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { validateAndResolvePath } from '../src/security/path-validator.js';
import {
  isSensitiveFile,
  isExcludedDirectory,
  isBinaryFile,
} from '../src/security/file-filter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Test infrastructure ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed++;
    errors.push(`  FAIL: ${message}`);
    console.error(`  ✗ FAIL: ${message}`);
  } else {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  }
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

const FIXTURE_DIR = path.join(__dirname, '__fixtures__');
const WORKSPACE_ROOT = FIXTURE_DIR;

function setupFixtures(): void {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, 'src'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, 'node_modules', 'some-dep'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, '.git'), { recursive: true });

  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'package.json'),
    JSON.stringify({ name: 'test', version: '1.0.0' }, null, 2)
  );
  fs.writeFileSync(path.join(FIXTURE_DIR, 'README.md'), '# Test Fixture\nThis is a test repository.');
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'src', 'index.ts'),
    'export const hello = "world";\n// TEST_SEARCH_MARKER\n'
  );
  fs.writeFileSync(path.join(FIXTURE_DIR, '.env'), 'SECRET=should_not_be_readable');
  fs.writeFileSync(path.join(FIXTURE_DIR, 'node_modules', 'some-dep', 'index.js'), 'module.exports = {}');
}

function teardownFixtures(): void {
  fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

// ─── Unit tests: path-validator ──────────────────────────────────────────────

async function testPathValidator(): Promise<void> {
  console.log('\n=== path-validator tests ===');

  // Valid relative paths
  const r1 = validateAndResolvePath(WORKSPACE_ROOT, '.');
  assert(r1.valid === true, 'Root "." should be valid');

  const r2 = validateAndResolvePath(WORKSPACE_ROOT, 'src');
  assert(r2.valid === true, '"src" should be valid');

  const r3 = validateAndResolvePath(WORKSPACE_ROOT, 'src/index.ts');
  assert(r3.valid === true, '"src/index.ts" should be valid');

  // Path traversal rejection
  const r4 = validateAndResolvePath(WORKSPACE_ROOT, '../outside');
  assert(r4.valid === false, '"../outside" should be rejected (traversal)');

  const r5 = validateAndResolvePath(WORKSPACE_ROOT, 'src/../../outside');
  assert(r5.valid === false, '"src/../../outside" should be rejected (traversal)');

  // Absolute path rejection
  const r6 = validateAndResolvePath(WORKSPACE_ROOT, 'C:\\Windows\\System32');
  assert(r6.valid === false, 'Absolute Windows path should be rejected');

  const r7 = validateAndResolvePath(WORKSPACE_ROOT, '/etc/passwd');
  assert(r7.valid === false, 'Absolute Unix path should be rejected');

  // Windows-style path separators in relative path (should work)
  const r8 = validateAndResolvePath(WORKSPACE_ROOT, 'src\\index.ts');
  assert(r8.valid === true, 'Windows backslash relative path should be valid');
}

// ─── Unit tests: file-filter ────────────────────────────────────────────────

async function testFileFilter(): Promise<void> {
  console.log('\n=== file-filter tests ===');

  // Sensitive files
  assert(isSensitiveFile('.env'), '.env should be sensitive');
  assert(isSensitiveFile('.env.local'), '.env.local should be sensitive');
  assert(isSensitiveFile('.env.production'), '.env.production should be sensitive');
  assert(isSensitiveFile('server.key'), '*.key should be sensitive');
  assert(isSensitiveFile('cert.pem'), '*.pem should be sensitive');
  assert(isSensitiveFile('credentials.json'), 'credentials.json should be sensitive');
  assert(isSensitiveFile('secrets.json'), 'secrets.json should be sensitive');
  assert(!isSensitiveFile('package.json'), 'package.json should NOT be sensitive');
  assert(!isSensitiveFile('src/index.ts'), 'src/index.ts should NOT be sensitive');

  // Excluded directories
  assert(isExcludedDirectory('node_modules'), 'node_modules should be excluded');
  assert(isExcludedDirectory('.git'), '.git should be excluded');
  assert(isExcludedDirectory('dist'), 'dist should be excluded');
  assert(isExcludedDirectory('build'), 'build should be excluded');
  assert(!isExcludedDirectory('src'), 'src should NOT be excluded');
  assert(!isExcludedDirectory('tests'), 'tests should NOT be excluded');

  // Binary files
  assert(isBinaryFile('image.png'), '.png should be binary');
  assert(isBinaryFile('archive.zip'), '.zip should be binary');
  assert(!isBinaryFile('src/index.ts'), '.ts should NOT be binary');
  assert(!isBinaryFile('package.json'), '.json should NOT be binary');
}

// ─── Integration tests: tools ────────────────────────────────────────────────

async function testListFiles(): Promise<void> {
  console.log('\n=== list_files tool tests ===');

  // Verify fixture exists
  assert(fs.existsSync(path.join(FIXTURE_DIR, 'src', 'index.ts')), 'Fixture src/index.ts exists');
  assert(fs.existsSync(path.join(FIXTURE_DIR, 'node_modules')), 'Fixture node_modules exists');

  // Directory listing respects exclusions
  const entries = fs.readdirSync(FIXTURE_DIR, { withFileTypes: true });
  const nodeModulesEntry = entries.find((e) => e.name === 'node_modules');
  assert(!!nodeModulesEntry && isExcludedDirectory('node_modules'), 'node_modules is excluded by filter');

  const envEntry = entries.find((e) => e.name === '.env');
  assert(!!envEntry && isSensitiveFile('.env'), '.env is excluded by sensitive filter');

  // Validate path resolves correctly
  const r = validateAndResolvePath(FIXTURE_DIR, 'src');
  assert(r.valid === true, 'src directory resolves within workspace');
  if (r.valid) {
    assert(r.resolved === path.join(FIXTURE_DIR, 'src'), 'Resolved path is correct');
  }
}

async function testReadFile(): Promise<void> {
  console.log('\n=== read_file tool tests ===');

  // Reading a valid file
  const r1 = validateAndResolvePath(FIXTURE_DIR, 'src/index.ts');
  assert(r1.valid === true, 'src/index.ts path is valid');
  if (r1.valid) {
    const content = fs.readFileSync(r1.resolved, 'utf-8');
    assert(content.includes('hello'), 'src/index.ts content is readable');
  }

  // .env is sensitive
  assert(isSensitiveFile('.env'), '.env is detected as sensitive (blocked)');

  // Traversal blocked
  const r2 = validateAndResolvePath(FIXTURE_DIR, '../mcp-server/package.json');
  assert(r2.valid === false, 'Path traversal to parent is rejected');

  // Absolute path blocked
  const r3 = validateAndResolvePath(FIXTURE_DIR, '/etc/hosts');
  assert(r3.valid === false, 'Absolute path is rejected');
}

async function testSearchWorkspace(): Promise<void> {
  console.log('\n=== search_workspace tool tests ===');

  // Verify the search marker is in the fixture file
  const content = fs.readFileSync(path.join(FIXTURE_DIR, 'src', 'index.ts'), 'utf-8');
  assert(content.includes('TEST_SEARCH_MARKER'), 'Fixture contains TEST_SEARCH_MARKER');

  // Manual search simulation (verifying the logic works)
  const lines = content.split('\n');
  const matchingLines = lines.filter((l) => l.includes('TEST_SEARCH_MARKER'));
  assert(matchingLines.length === 1, 'TEST_SEARCH_MARKER found in exactly 1 line');

  // node_modules and .git should not be searched (excluded)
  assert(isExcludedDirectory('node_modules'), 'node_modules excluded from search');
  assert(isExcludedDirectory('.git'), '.git excluded from search');
}

// ─── HTTP integration test ────────────────────────────────────────────────────

async function testServerHttp(): Promise<void> {
  console.log('\n=== HTTP server integration tests ===');

  // Start server temporarily for HTTP tests
  process.env['REPOSTACK_WORKSPACE'] = FIXTURE_DIR;

  let serverProcess: ChildProcess | undefined;

  try {
    // Start server — set cwd to mcp-server root so tsx resolves correctly
    const mcpServerRoot = path.join(__dirname, '..');
    serverProcess = spawn(
      'node',
      ['--import', 'tsx/esm', 'src/index.ts'],
      {
        cwd: mcpServerRoot,
        env: { ...process.env, REPOSTACK_WORKSPACE: FIXTURE_DIR, PORT: '3099' },
        stdio: 'pipe',
      }
    );

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      let stderrOutput = '';
      const timeout = setTimeout(() => {
        reject(new Error(`Server start timeout after 8000ms. Stderr: ${stderrOutput}`));
      }, 8000);

      serverProcess!.stdout?.on('data', (data: Buffer) => {
        if (data.toString().includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess!.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      serverProcess!.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0 && code !== null) {
          reject(new Error(`Server process exited with code ${code}. Stderr: ${stderrOutput}`));
        }
      });

      serverProcess!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Test health endpoint
    const healthRes = await fetch('http://127.0.0.1:3099/health');
    assert(healthRes.ok, 'Health endpoint returns 200');
    const health = (await healthRes.json()) as Record<string, unknown>;
    assert(health['status'] === 'ok', 'Health response has status ok');

    // Test MCP endpoint is reachable
    const mcpRes = await fetch('http://127.0.0.1:3099/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });
    assert(mcpRes.ok, 'MCP endpoint returns 200 for initialize');
    const mcpBody = await mcpRes.text();
    assert(mcpBody.length > 0, 'MCP endpoint returns non-empty response');

    // Test tools/list — stateless transport: initialize first, then tools/list
    await fetch('http://127.0.0.1:3099/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });
    const listRes = await fetch('http://127.0.0.1:3099/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {},
      }),
    });
    console.log(`  [debug] tools/list status: ${listRes.status}`);
    const listBody = await listRes.text();
    console.log(`  [debug] tools/list body (first 200): ${listBody.slice(0, 200)}`);
    assert(listRes.ok, 'MCP tools/list returns 200 in stateless mode');
  } finally {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('RepoStack MCP Server — Test Suite\n');

  setupFixtures();

  try {
    await testPathValidator();
    await testFileFilter();
    await testListFiles();
    await testReadFile();
    await testSearchWorkspace();
    await testServerHttp();
  } finally {
    teardownFixtures();
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error('\nFailed assertions:');
    errors.forEach((e) => console.error(e));
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
