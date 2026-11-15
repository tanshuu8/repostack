/**
 * E4B — Custom Result via user.tool_response
 * Critical test: can extension inject custom tool results into TrueForge?
 * This determines whether the extension can bypass the MCP server for proposal staging.
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

// We need the spike-approval agent (with echo_edit requiring approval)
// Find the spike-approval agent ID
const client = new TrueFoundry({ baseURL: BASE_URL });

const log = {
  experiment: 'E4B_user_tool_response',
  timestamp: new Date().toISOString(),
  findings: [],
  events: [],
};

async function main() {
  console.log('=== E4B: user.tool_response custom result injection ===');

  try {
    // Find spike-approval agent
    const agents = await client.agents.list();
    const approvalAgent = agents.items?.find(a => a.name === 'spike-approval');

    if (!approvalAgent) {
      log.error = 'spike-approval agent not found';
      log.agentList = agents.items?.map(a => a.name);
      throw new Error('spike-approval agent not found. Available: ' + agents.items?.map(a => a.name).join(', '));
    }

    console.log('Found spike-approval agent:', approvalAgent.id);
    log.agentId = approvalAgent.id;

    // Create session
    const session = await client.sessions.create({ agentId: approvalAgent.id });
    log.sessionId = session.id;
    console.log('Session:', session.id);

    // Start turn — agent will eventually call echo_edit which requires approval
    const stream = client.sessions.createTurnStream(session.id, {
      messages: [{
        role: 'user',
        content: 'Please call the echo_edit tool with path="src/example.ts" and content="console.log(\'hello\')"'
      }],
    });

    let turnId = null;
    let approvalEvent = null;
    let toolCallId = null;
    let toolCallArgs = null;
    const precedingModelMessage = { toolCalls: [] };

    // Collect events until approval_required
    for await (const event of stream) {
      log.events.push({ type: event.type, ts: Date.now() });
      console.log('Event:', event.type);

      if (event.type === 'turn.created') {
        turnId = event.turn?.id || event.turnId;
        console.log('  Turn ID:', turnId);
      }

      // Buffer preceding model message to capture tool args
      if (event.type === 'model.message.delta' && event.toolCalls?.length > 0) {
        event.toolCalls.forEach(tc => {
          const existing = precedingModelMessage.toolCalls.find(x => x.index === tc.index);
          if (existing) {
            if (tc.function?.arguments) existing.function.arguments = (existing.function?.arguments || '') + tc.function.arguments;
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function = { ...existing.function, name: tc.function.name };
          } else {
            precedingModelMessage.toolCalls.push({ ...tc, function: { ...tc.function } });
          }
        });
      }

      if (event.type === 'tool.approval_required') {
        approvalEvent = event;
        toolCallId = event.toolCalls?.[0]?.id;
        // Find args from preceding model message
        const matchingCall = precedingModelMessage.toolCalls.find(tc => tc.id === toolCallId);
        toolCallArgs = matchingCall?.function?.arguments;
        console.log('  Approval required! toolCallId:', toolCallId);
        console.log('  Args from preceding event:', toolCallArgs);
        log.approvalEventFound = true;
        log.toolCallId = toolCallId;
        log.toolCallArgs = toolCallArgs;
        break; // Stop consuming stream, we'll respond manually
      }
    }

    if (!approvalEvent) {
      log.findings.push('No approval event received — agent may not have called echo_edit');
      log.status = 'NO_APPROVAL_EVENT';
      return;
    }

    // ── TEST 1: Inject custom tool response ──
    console.log('\n--- Test 1: user.tool_response with custom content ---');
    const customResult = JSON.stringify({
      status: 'staged',
      proposalId: 'prop_test_123',
      hunks: 1,
      preview: 'console.log("hello")',
      message: 'Edit staged for review. Awaiting developer approval.'
    });

    let test1Result = null;
    try {
      test1Result = await client.sessions.createTurnEvent(session.id, turnId, {
        events: [{
          type: 'user.tool_response',
          threadId: approvalEvent.threadId || 'main',
          toolCallId: toolCallId,
          content: customResult,
        }]
      });
      console.log('  user.tool_response accepted! Response:', JSON.stringify(test1Result).slice(0, 200));
      log.findings.push('user.tool_response: ACCEPTED by TrueForge (HTTP 200)');
      log.test1Response = test1Result;
    } catch (e) {
      console.log('  user.tool_response FAILED:', e.message);
      log.findings.push('user.tool_response: REJECTED — ' + e.message.slice(0, 100));
      log.test1Error = e.message;

      // Fallback: try standard allow instead
      console.log('  Falling back to standard allow...');
      await client.sessions.createTurnEvent(session.id, turnId, {
        events: [{
          type: 'user.tool_approval',
          threadId: approvalEvent.threadId || 'main',
          toolCallId: toolCallId,
          approval: { status: 'allow' }
        }]
      });
    }

    // Now read remaining stream to see what agent does with the custom response
    console.log('\n--- Collecting remaining stream events ---');
    let agentFinalResponse = '';
    try {
      const stream2 = client.sessions.createTurnStream(session.id, {
        messages: [{ role: 'user', content: 'What was the result of the echo_edit call? Describe what was staged.' }]
      });

      for await (const event of stream2) {
        if (event.type === 'model.message.delta' && event.content) {
          agentFinalResponse += event.content;
          process.stdout.write('.');
        }
        if (event.type === 'turn.done') {
          console.log('\n  Follow-up turn done');
        }
      }
    } catch (e) {
      console.log('  Follow-up stream error:', e.message);
    }

    log.agentFollowUpResponse = agentFinalResponse.slice(0, 500);
    console.log('\nAgent follow-up:', agentFinalResponse.slice(0, 300));

    if (agentFinalResponse.toLowerCase().includes('staged') ||
        agentFinalResponse.toLowerCase().includes('proposal') ||
        agentFinalResponse.toLowerCase().includes('prop_test')) {
      log.findings.push('CRITICAL: Agent response references custom tool result content — custom injection WORKS');
      log.customInjectionWorks = true;
    } else {
      log.findings.push('Agent response does not clearly reference custom content — injection effect unclear');
      log.customInjectionWorks = 'UNCLEAR';
    }

    log.status = 'COMPLETED';
  } catch (e) {
    log.error = e.message;
    log.status = 'ERROR';
    console.error('Fatal error:', e.message);
  } finally {
    const output = JSON.stringify(log, null, 2).replace(/"api[-_]?key"\s*:\s*"[^"]+"/gi, '"api_key": "***"');
    writeFileSync(join(__dirname, '..', '..', 'logs', 'e4b.json'), output);
    console.log('\n✅ Results saved to spike/logs/e4b.json');
    console.log('Findings:');
    log.findings.forEach(f => console.log(' -', f));
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

