// spike/experiments/e1/test-connectivity.mjs
import * as dns from 'node:dns/promises';
import { TrueForge } from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/18da9bb0c07c9a14/node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs';

const results = {};

console.log('=== EXPERIMENT E1: CONNECTIVITY & WINDOWS IPV4/IPV6 RESOLUTION ===\n');

// 1. DNS Resolution of localhost on Windows 11
try {
  const lookupAll = await dns.lookup('localhost', { all: true });
  console.log('DNS lookup for "localhost":', lookupAll);
  results.dnsLookup = lookupAll;
} catch (err) {
  console.error('DNS lookup error:', err.message);
  results.dnsLookupError = err.message;
}

// 2. Direct HTTP Fetch against endpoints
const endpoints = [
  'http://localhost:8790',
  'http://[::1]:8790',
  'http://127.0.0.1:8790'
];

for (const ep of endpoints) {
  const start = Date.now();
  try {
    const res = await fetch(ep, { signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    const duration = Date.now() - start;
    console.log(`[fetch] ${ep} -> Status: ${res.status} (${duration}ms) - Length: ${text.length}`);
    results[`fetch_${ep}`] = { status: res.status, ok: res.ok, durationMs: duration };
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`[fetch] ${ep} -> FAILED (${duration}ms): ${err.message}`);
    results[`fetch_${ep}`] = { error: err.message, durationMs: duration };
  }
}

// 3. TrueForge SDK client against endpoints
for (const ep of endpoints) {
  const start = Date.now();
  try {
    const client = new TrueForge({ baseUrl: ep, timeoutInSeconds: 3 });
    const agents = await client.agents.list();
    const duration = Date.now() - start;
    console.log(`[SDK] ${ep} -> SUCCESS (${duration}ms) - Found ${agents.data?.length ?? 0} agents`);
    results[`sdk_${ep}`] = { success: true, count: agents.data?.length ?? 0, durationMs: duration };
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`[SDK] ${ep} -> FAILED (${duration}ms): ${err.message}`);
    results[`sdk_${ep}`] = { error: err.message, durationMs: duration };
  }
}

console.log('\n=== E1 RESULTS SUMMARY ===\n', JSON.stringify(results, null, 2));

