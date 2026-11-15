/**
 * E6 — Context Engineering Experiments
 * Tests: compaction events, large tool responses, subagent delegation
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..');
const require = createRequire(join(projectRoot, 'mcp-server', 'package.json'));

// Use the TrueForge SDK from the project root
const sdkRequire = createRequire(join(projectRoot, 'package.json'));
const { TrueFoundry } = sdkRequire('@truefoundry/trueforge');

const BASE_URL = 'http://localhost:8790';
const SPIKE_AGENT_ID = '01m66sbbdwyxwj19wxetmcrn56'; // spike-agent

const client = new TrueFoundry({ baseURL: BASE_URL });

const log = { experiments: {}, timestamp: new Date().toISOString() };

// ──────────────────────────────────────────────
// E6A — Context Compaction (watch for compaction events)
// We run multiple turns to build up context, then watch for compaction signals
// ──────────────────────────────────────────────
async function runE6A() {
  console.log('\n=== E6A: Context Compaction ===');
  const result = {
    name: 'E6A_context_compaction',
    sessionId: null,
    turnsRun: 0,
    compactionEvents: [],
    totalEvents: [],
    error: null,
  };

  try {
    // Create session with compaction enabled
    const session = await client.sessions.create({
      agentId: SPIKE_AGENT_ID,
    });
    result.sessionId = session.id;
    console.log('Session created:', session.id);

    const prompts = [
      'List the top-level files and directories in the workspace. Just the names, no descriptions needed.',
      'Now read the file src/tools/list-files.ts and give me the first 5 lines.',
      'Now list the files in the src/tools directory.',
      'Now read src/tools/read-file.ts and tell me what parameters it expects.',
      'Summarize what you\'ve learned so far about the repostack MCP server architecture in 3 bullet points.',
    ];

    for (let i = 0; i < prompts.length; i++) {
      console.log(`\nTurn ${i + 1}: ${prompts[i].slice(0, 60)}...`);
      const stream = client.sessions.createTurnStream(session.id, {
        messages: [{ role: 'user', content: prompts[i] }],
      });

      const turnEvents = [];
      let turnId = null;
      for await (const event of stream) {
        turnEvents.push(event.type);
        if (event.type === 'turn.created') turnId = event.turnId || event.turn?.id;
        if (event.type === 'ThreadContextCompactionStartedEvent' ||
            event.type === 'thread.context_compaction.started') {
          result.compactionEvents.push({ turn: i + 1, type: event.type, data: event });
          console.log('  *** COMPACTION STARTED ***', JSON.stringify(event).slice(0, 200));
        }
        if (event.type === 'ThreadContextCompactionFinishedEvent' ||
            event.type === 'thread.context_compaction.finished') {
          result.compactionEvents.push({ turn: i + 1, type: event.type, data: event });
          console.log('  *** COMPACTION FINISHED ***', JSON.stringify(event).slice(0, 200));
        }
        if (event.type === 'turn.done') {
          console.log(`  Turn ${i+1} done. Events: ${turnEvents.join(', ')}`);
        }
      }
      result.turnsRun++;
      result.totalEvents.push({ turn: i + 1, events: turnEvents });
    }

    result.status = result.compactionEvents.length > 0 ? 'COMPACTION_OBSERVED' : 'NO_COMPACTION';
    console.log(`\nE6A complete. Compaction events: ${result.compactionEvents.length}`);
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E6A error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// E6B — Large Tool Response Handling
// We test the spike-mcp `large_response` tool if it exists, otherwise use read_file on a large file
// ──────────────────────────────────────────────
async function runE6B() {
  console.log('\n=== E6B: Large Tool Response ===');
  const result = {
    name: 'E6B_large_tool_response',
    sessionId: null,
    toolResponseSize: null,
    events: [],
    truncationObserved: false,
    error: null,
  };

  try {
    const session = await client.sessions.create({ agentId: SPIKE_AGENT_ID });
    result.sessionId = session.id;

    // Ask agent to read a known large file (the test file)
    const stream = client.sessions.createTurnStream(session.id, {
      messages: [{
        role: 'user',
        content: 'Please read the file mcp-server/src/__tests__/server.test.ts and tell me how many lines it has. Just count the lines and report the number.'
      }],
    });

    for await (const event of stream) {
      result.events.push(event.type);
      if (event.type === 'tool.response' || event.type === 'ToolResponseEvent') {
        const content = JSON.stringify(event).length;
        result.toolResponseSize = content;
        console.log('  Tool response event size (chars):', content);
        // Check for truncation indicators
        if (JSON.stringify(event).includes('truncat') || JSON.stringify(event).includes('...')) {
          result.truncationObserved = true;
        }
      }
      if (event.type === 'model.message.delta' && event.content) {
        process.stdout.write('.');
      }
      if (event.type === 'turn.done') {
        console.log('\n  Turn done. Events seen:', result.events.join(', '));
      }
    }

    result.status = 'COMPLETED';
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E6B error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// E6C — Skills Catalog Inspection
// Check what skills are available and if any can be enabled
// ──────────────────────────────────────────────
async function runE6C() {
  console.log('\n=== E6C: Skills / Subagents Catalog ===');
  const result = {
    name: 'E6C_skills_catalog',
    skills: [],
    subagentCapability: false,
    error: null,
  };

  try {
    // Try listing available skills/agents
    const agents = await client.agents.list();
    result.agentList = agents.items?.map(a => ({ id: a.id, name: a.name })) || [];
    console.log('Agents found:', result.agentList.length);
    result.agentList.forEach(a => console.log(' -', a.name, a.id));

    // Test if an agent can reference/delegate to another agent (subagent)
    // We check SDK types for subagent capability
    const session = await client.sessions.create({ agentId: SPIKE_AGENT_ID });
    result.sessionId = session.id;

    // Try a turn that asks the agent to describe its capabilities
    const stream = client.sessions.createTurnStream(session.id, {
      messages: [{
        role: 'user',
        content: 'What tools do you have available? List them briefly.'
      }],
    });

    const toolsUsed = [];
    for await (const event of stream) {
      if (event.type === 'model.message' && event.toolCalls?.length > 0) {
        event.toolCalls.forEach(tc => toolsUsed.push(tc.function?.name));
      }
      if (event.type === 'turn.done') {
        console.log('Tools used:', toolsUsed);
      }
    }
    result.toolsUsed = toolsUsed;
    result.status = 'COMPLETED';
  } catch (e) {
    result.error = e.message;
    result.status = 'ERROR';
    console.error('E6C error:', e.message);
  }

  return result;
}

// ──────────────────────────────────────────────
// Run all E6 experiments
// ──────────────────────────────────────────────
async function main() {
  console.log('Starting E6 experiments at', new Date().toISOString());

  log.experiments.e6a = await runE6A();
  log.experiments.e6b = await runE6B();
  log.experiments.e6c = await runE6C();

  // Sanitize: remove any potential API keys
  const output = JSON.stringify(log, null, 2).replace(/"api[-_]?key"\s*:\s*"[^"]+"/gi, '"api_key": "***"');
  writeFileSync(join(__dirname, '..', '..', 'logs', 'e6.json'), output);
  console.log('\n✅ E6 results saved to spike/logs/e6.json');
  console.log('Summary:');
  console.log('  E6A compaction events:', log.experiments.e6a?.compactionEvents?.length ?? 'N/A');
  console.log('  E6B tool response size:', log.experiments.e6b?.toolResponseSize ?? 'N/A');
  console.log('  E6C agent count:', log.experiments.e6c?.agentList?.length ?? 'N/A');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

