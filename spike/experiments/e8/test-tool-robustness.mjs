/**
 * Experiment E8: Tool Chaining Robustness Across Reasoning Configurations.
 */
/**
 * E8 — Tool Robustness Across Models / ReasoningEffort
 * Tests: multi-step tool chains, different reasoning levels, error recovery
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..');
const sdkRequire = createRequire(join(projectRoot, 'package.json'));
const { TrueFoundry } = sdkRequire('@truefoundry/trueforge');

const BASE_URL = 'http://localhost:8790';
const SPIKE_AGENT_ID = '01m66sbbdwyxwj19wxetmcrn56'; // spike-agent with repostack-mcp

const client = new TrueFoundry({ baseURL: BASE_URL });
const log = { experiments: {}, timestamp: new Date().toISOString() };

async function runTurn(sessionId, content, reasoningEffort = 'low') {
  const stream = client.sessions.createTurnStream(sessionId, {
    messages: [{ role: 'user', content }],
    reasoningEffort,
  });

  const events = [];
  const toolCalls = [];
  let response = '';
  let startTime = Date.now();

  for await (const event of stream) {
    events.push(event.type);
    if (event.type === 'model.message' && event.toolCalls?.length) {
      event.toolCalls.forEach(tc => toolCalls.push({
        name: tc.function?.name,
        args: tc.function?.arguments?.slice(0, 100)
      }));
    }
    if (event.type === 'model.message.delta' && event.content) {
      response += event.content;
    }
  }

  return {
    events,
    toolCalls,
    response: response.slice(0, 500),
    durationMs: Date.now() - startTime,
  };
}

// ──────────────────────────────────────────────
// E8A — Multi-step tool chain (list → read → analyze)
// ──────────────────────────────────────────────
async function runE8A() {
  console.log('\n=== E8A: Multi-step Tool Chain ===');
  const result = { name: 'E8A_multi_step', trials: [] };

  try {
    const session = await client.sessions.create({ agentId: SPIKE_AGENT_ID });
    result.sessionId = session.id;

    const taskPrompt = `
Please do the following steps:
1. List the files in the src/tools directory of the workspace
2. Read the file src/tools/list-files.ts
3. Identify all exported function names in that file
4. Report: the count of tools files, and the exported function names from list-files.ts

Be systematic and use the tools provided.`.trim();

    console.log('Running multi-step task...');
    const t0 = Date.now();
    const trial = await runTurn(session.id, taskPrompt, 'low');
    trial.reasoning = 'low';
    result.trials.push(trial);
    console.log('  Tool calls:', trial.toolCalls.map(tc => tc.name).join(' → '));
    console.log('  Duration:', trial.durationMs, 'ms');
    console.log('  Response preview:', trial.response.slice(0, 200));

    result.status = 'COMPLETED';
    result.toolCallChain = trial.toolCalls.map(tc => tc.name);
    result.correctToolSequence = trial.toolCalls.some(tc => tc.name?.includes('list')) &&
                                  trial.toolCalls.some(tc => tc.name?.includes('read'));
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E8A error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// E8B — Error recovery: ask for nonexistent file
// ──────────────────────────────────────────────
async function runE8B() {
  console.log('\n=== E8B: Tool Error Recovery ===');
  const result = { name: 'E8B_error_recovery', findings: [] };

  try {
    const session = await client.sessions.create({ agentId: SPIKE_AGENT_ID });
    result.sessionId = session.id;

    const trial = await runTurn(session.id,
      'Please read the file src/tools/nonexistent-file-xyz-123.ts and tell me what it contains.',
      'low'
    );

    result.events = trial.events;
    result.toolCalls = trial.toolCalls;
    result.response = trial.response;

    // Check if agent recovered gracefully
    if (trial.response.toLowerCase().includes('not found') ||
        trial.response.toLowerCase().includes('does not exist') ||
        trial.response.toLowerCase().includes('unable to') ||
        trial.response.toLowerCase().includes('error')) {
      result.findings.push('Agent correctly reported file not found / error');
      result.gracefulRecovery = true;
    } else {
      result.findings.push('Agent response unclear after tool error');
      result.gracefulRecovery = false;
    }

    result.status = 'COMPLETED';
    console.log('  Tool calls:', trial.toolCalls.map(tc => tc.name).join(', '));
    console.log('  Graceful recovery:', result.gracefulRecovery);
    console.log('  Response:', trial.response.slice(0, 200));
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E8B error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// E8C — Search + Read combination
// ──────────────────────────────────────────────
async function runE8C() {
  console.log('\n=== E8C: Search + Read Combination ===');
  const result = { name: 'E8C_search_read', findings: [] };

  try {
    const session = await client.sessions.create({ agentId: SPIKE_AGENT_ID });
    result.sessionId = session.id;

    const trial = await runTurn(session.id,
      'Search the workspace for any file that contains the text "validatePath" then read the first file that contains it. Report: what function is validatePath and what does it return?',
      'low'
    );

    result.toolCalls = trial.toolCalls;
    result.response = trial.response;
    result.durationMs = trial.durationMs;

    const usedSearch = trial.toolCalls.some(tc => tc.name?.includes('search'));
    const usedRead = trial.toolCalls.some(tc => tc.name?.includes('read'));
    result.usedSearch = usedSearch;
    result.usedRead = usedRead;
    result.findings.push(`Used search_workspace: ${usedSearch}, Used read_file: ${usedRead}`);
    result.findings.push(`Tool call count: ${trial.toolCalls.length}`);
    result.status = 'COMPLETED';
    console.log('  Tool calls:', trial.toolCalls.map(tc => tc.name).join(' → '));
    console.log('  Duration:', trial.durationMs, 'ms');
    console.log('  Response:', trial.response.slice(0, 200));
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E8C error:', e.message);
  }

  return result;
}

async function main() {
  console.log('Starting E8 experiments at', new Date().toISOString());

  log.experiments.e8a = await runE8A();
  log.experiments.e8b = await runE8B();
  log.experiments.e8c = await runE8C();

  const output = JSON.stringify(log, null, 2).replace(/"api[-_]?key"\s*:\s*"[^"]+"/gi, '"api_key": "***"');
  writeFileSync(join(__dirname, '..', '..', 'logs', 'e8.json'), output);
  console.log('\n✅ E8 results saved to spike/logs/e8.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

