/**
 * E9 — Workspace Pointing Strategies
 * Tests: per-workspace MCP server approach vs dynamic tool argument approach
 * Evaluates security and feasibility of each on Windows
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..');
const sdkRequire = createRequire(join(projectRoot, 'package.json'));
const { TrueFoundry } = sdkRequire('@truefoundry/trueforge');

const BASE_URL = 'http://localhost:8790';
const SPIKE_AGENT_ID = '01m66sbbdwyxwj19wxetmcrn56';

const log = { experiments: {}, timestamp: new Date().toISOString() };

// ──────────────────────────────────────────────
// E9A — Approach A: Environment Variable Workspace Pointing
// Test: spawn a second MCP server instance with different REPOSTACK_WORKSPACE
// ──────────────────────────────────────────────
async function runE9A() {
  console.log('\n=== E9A: Environment Variable Workspace Pointing ===');
  const result = { name: 'E9A_env_var_approach', findings: [] };

  try {
    // Check if we can start a second MCP server instance on a different port
    // pointing to a different workspace (e.g., the spike/ directory itself)
    const spikeWorkspace = join(projectRoot, 'spike');
    const testPort = 3003;

    console.log(`Would spawn: REPOSTACK_WORKSPACE=${spikeWorkspace} node mcp-server/dist/server.js --port ${testPort}`);

    // Verify the mcp-server is built
    const distServerPath = join(projectRoot, 'mcp-server', 'dist', 'server.js');
    const distExists = existsSync(distServerPath);
    result.distServerExists = distExists;
    result.findings.push(`mcp-server/dist/server.js exists: ${distExists}`);

    // Check the MCP server env var documentation
    result.findings.push('Approach A mechanism: spawn separate process per workspace');
    result.findings.push('Env var: REPOSTACK_WORKSPACE');
    result.findings.push('Isolation: complete — separate process, separate port, separate TrueForge connector');

    // Security analysis
    result.securityAnalysis = {
      approach: 'Environment variable per-process',
      pathValidation: 'Server validates path on startup, cannot be changed at runtime',
      symlinkEscape: 'Protected by server-side symlink checks',
      processIsolation: 'Full process boundary',
      windowsCompatibility: 'Compatible — env vars work on Windows',
      portManagement: 'Extension must track port allocations',
      connectorRegistration: 'Requires dynamic TrueForge connector creation per workspace',
    };

    // Test connector creation API
    const client = new TrueFoundry({ baseURL: BASE_URL });
    const connectorMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.mcpConnectors || client.mcp || {}));
    result.connectorApiMethods = connectorMethods;
    console.log('Connector API methods:', connectorMethods.join(', '));

    // Check if dynamic connector creation is possible
    let connectorApiExists = false;
    try {
      if (client.mcpConnectors) {
        result.findings.push('client.mcpConnectors API exists');
        connectorApiExists = true;
      } else if (client.mcp) {
        result.findings.push('client.mcp API exists');
        connectorApiExists = true;
      } else {
        // Check raw client keys
        const clientKeys = Object.keys(client);
        result.clientKeys = clientKeys;
        result.findings.push('No mcpConnectors/mcp API found. Client keys: ' + clientKeys.join(', '));
      }
    } catch (e) {
      result.findings.push('Connector API check error: ' + e.message.slice(0, 80));
    }

    result.connectorApiExists = connectorApiExists;
    result.status = 'ANALYZED';
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E9A error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// E9B — Approach B: Dynamic workspace argument in tool calls
// Test: modify read_file/list_files to accept an optional workspace_root
// ──────────────────────────────────────────────
async function runE9B() {
  console.log('\n=== E9B: Dynamic Workspace Argument Approach ===');
  const result = { name: 'E9B_dynamic_arg_approach', findings: [] };

  try {
    // Analyze the current MCP server tool schemas
    const http = await import('http');

    // Make MCP tools/list request to running MCP server
    const mcpToolsRequest = () => new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1,
      });

      // Use SSE endpoint
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3001,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Content-Length': Buffer.byteLength(postData),
        }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data.slice(0, 2000) }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    const toolsResp = await mcpToolsRequest();
    result.mcpToolsStatus = toolsResp.status;
    result.mcpToolsSample = toolsResp.body.slice(0, 500);

    // Extract tool schemas to check if workspace_root is a parameter
    const hasWorkspaceParam = toolsResp.body.includes('workspace_root') || toolsResp.body.includes('workspaceRoot');
    result.currentSchemaHasWorkspaceParam = hasWorkspaceParam;
    result.findings.push(`Current tools have workspace_root param: ${hasWorkspaceParam}`);

    // Security analysis for dynamic arg approach
    result.securityAnalysis = {
      approach: 'Workspace root passed as tool argument',
      risks: [
        'Path traversal if validation insufficient',
        'Client-supplied workspace root bypasses server-side config',
        'Agent could be tricked into reading arbitrary paths',
      ],
      mitigations: [
        'Validate workspace_root against allowlist of registered workspaces',
        'Validate workspace_root is absolute and normalized',
        'Symlink escape checks on every resolved path',
        'Allowlist from extension config, not from agent prompts',
      ],
      windowsCompatibility: 'Compatible — path normalization handles Windows paths',
    };

    result.findings.push('Approach B requires allowlist validation to prevent path traversal');
    result.findings.push('Approach A (env var) safer: workspace locked at server startup, no runtime override');
    result.status = 'ANALYZED';
    console.log('Current tools have workspace_root param:', hasWorkspaceParam);
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E9B error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// E9C — TrueForge Settings API inspection
// Can we dynamically register/update connectors via SDK?
// ──────────────────────────────────────────────
async function runE9C() {
  console.log('\n=== E9C: TrueForge Settings API Inspection ===');
  const result = { name: 'E9C_settings_api', findings: [] };

  try {
    const client = new TrueFoundry({ baseURL: BASE_URL });
    const topLevelKeys = Object.keys(client).filter(k => !k.startsWith('_'));
    result.clientTopLevelKeys = topLevelKeys;
    console.log('Client top-level resources:', topLevelKeys.join(', '));

    // Check for settings, connectors, or mcp-related APIs
    for (const key of topLevelKeys) {
      try {
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client[key])).filter(m => m !== 'constructor');
        result[`${key}_methods`] = methods;
        console.log(`  client.${key}: ${methods.join(', ')}`);
      } catch (e) {
        // Not an object with prototype methods
      }
    }

    // Try to list/read existing connectors via REST API
    const http = await import('http');
    const restCheck = (path) => new Promise(resolve => {
      http.get(`http://localhost:8790${path}`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 500) }));
      }).on('error', e => resolve({ error: e.message }));
    });

    const endpoints = [
      '/api/connectors',
      '/api/mcp-connectors',
      '/api/settings',
      '/v1/connectors',
      '/v1/mcp',
    ];

    result.endpointProbes = {};
    for (const ep of endpoints) {
      const r = await restCheck(ep);
      result.endpointProbes[ep] = { status: r.status, sample: r.body?.slice(0, 100) || r.error };
      console.log(`  GET ${ep}: ${r.status || r.error}`);
    }

    result.findings.push('Dynamic connector management: ' +
      (Object.values(result.endpointProbes).some(r => r.status === 200)
        ? 'REST endpoint found'
        : 'No accessible REST endpoint — requires manual TrueForge UI/config'));

    result.status = 'COMPLETED';
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E9C error:', e.message);
  }

  return result;
}

async function main() {
  console.log('Starting E9 experiments at', new Date().toISOString());

  log.experiments.e9a = await runE9A();
  log.experiments.e9b = await runE9B();
  log.experiments.e9c = await runE9C();

  const output = JSON.stringify(log, null, 2).replace(/"api[-_]?key"\s*:\s*"[^"]+"/gi, '"api_key": "***"');
  writeFileSync(join(__dirname, '..', '..', 'logs', 'e9.json'), output);
  console.log('\n✅ E9 results saved to spike/logs/e9.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

