// spike/experiments/e4/run-approval-spike.mjs
import { TrueForge } from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/18da9bb0c07c9a14/node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs';
import * as fs from 'node:fs';

const client = new TrueForge({ baseUrl: 'http://localhost:8790' });

console.log('=== EXPERIMENT E4: TOOL APPROVAL GATING & RESOLUTION SPIKE (CORRECTED) ===\n');

const AGENT_NAME = 'spike-approval';

// Test 1: Approval Allow (E4A & E4B)
console.log('\n--- TEST 1: Approval Interception & Allow Resolution ---');
const sessionA = await client.sessions.create({
  agent: { name: AGENT_NAME },
  metadata: { 'spike.test': 'e4-allow' }
});
const sessionAId = sessionA.data.id;
console.log(`Session created: ${sessionAId}`);

const streamA = await client.sessions.createTurnStream(sessionAId, {
  input: [
    {
      type: 'user.message',
      content: 'Call echo_edit on example.txt to change "old" to "new".'
    }
  ]
});

let currentTurnIdA = null;
const allEventsA = [];
let capturedToolCallArgs = null;
let approvalEventA = null;
let allowSuccess = false;

for await (const event of streamA) {
  allEventsA.push(event);
  console.log(`[Stream A Event] ${event.type}`);

  if (event.type === 'turn.created') {
    currentTurnIdA = event.turnId ?? event.id;
  }

  // Look for toolCalls in model.message or model.message.delta
  if (event.toolCalls) {
    console.log('[Tool Calls detected in event]:', JSON.stringify(event.toolCalls));
    capturedToolCallArgs = event.toolCalls;
  }

  if (event.type === 'tool.approval_required') {
    approvalEventA = event;
    const toolCall = event.toolCalls?.[0];
    const toolCallId = toolCall?.id;
    console.log(`\n>>> ToolApprovalRequiredEvent captured for toolCallId: ${toolCallId}`);
    console.log('Event details:', JSON.stringify(event));

    // Submit allow resolution
    console.log('>>> Submitting approval with status: "allow" via createTurnEvent...');
    try {
      const res = await client.sessions.createTurnEvent(sessionAId, currentTurnIdA, {
        events: [
          {
            type: 'user.tool_approval',
            threadId: event.threadId,
            toolCallId: toolCallId,
            approval: { status: 'allow' }
          }
        ]
      });
      allowSuccess = true;
      console.log('>>> createTurnEvent SUCCESS:', JSON.stringify(res));
    } catch (err) {
      console.error('>>> createTurnEvent FAILED:', err.message, err.body);
    }
  }

  if (event.type === 'tool.response') {
    console.log('>>> Tool executed after approval! Tool Response Event:', JSON.stringify(event).slice(0, 300));
  }

  if (event.type === 'turn.done') {
    console.log('>>> Turn completed after approval! Status:', event.state?.status);
    console.log('>>> Agent message:', event.state?.output?.content?.slice(0, 200));
  }
}

// Test 2: Approval Deny with Reason (E4C)
console.log('\n--- TEST 2: Approval Interception & Deny with Human Reason ---');
const sessionC = await client.sessions.create({
  agent: { name: AGENT_NAME },
  metadata: { 'spike.test': 'e4-deny' }
});
const sessionCId = sessionC.data.id;
console.log(`Session created: ${sessionCId}`);

const streamC = await client.sessions.createTurnStream(sessionCId, {
  input: [
    {
      type: 'user.message',
      content: 'Call echo_edit on example.txt to change "old" to "new".'
    }
  ]
});

let currentTurnIdC = null;
const allEventsC = [];
let denySuccess = false;

for await (const event of streamC) {
  allEventsC.push(event);
  console.log(`[Stream C Event] ${event.type}`);

  if (event.type === 'turn.created') {
    currentTurnIdC = event.turnId ?? event.id;
  }

  if (event.type === 'tool.approval_required') {
    const toolCall = event.toolCalls?.[0];
    const toolCallId = toolCall?.id;
    console.log(`\n>>> ToolApprovalRequiredEvent captured for Deny test. toolCallId: ${toolCallId}`);

    console.log('>>> Submitting approval with status: "deny" and custom reason...');
    try {
      const res = await client.sessions.createTurnEvent(sessionCId, currentTurnIdC, {
        events: [
          {
            type: 'user.tool_approval',
            threadId: event.threadId,
            toolCallId: toolCallId,
            approval: {
              status: 'deny',
              reason: 'Developer rejected change: "new" is deprecated.'
            }
          }
        ]
      });
      denySuccess = true;
      console.log('>>> Deny createTurnEvent SUCCESS:', JSON.stringify(res));
    } catch (err) {
      console.error('>>> Deny createTurnEvent FAILED:', err.message, err.body);
    }
  }

  if (event.type === 'turn.done') {
    console.log('>>> Turn completed after deny! Status:', event.state?.status);
    console.log('>>> Agent response to deny:', event.state?.output?.content?.slice(0, 300));
  }
}

// Test 3: Cancel while waiting for approval (E4E)
console.log('\n--- TEST 3: Cancellation during pending approval ---');
const sessionE = await client.sessions.create({
  agent: { name: AGENT_NAME },
  metadata: { 'spike.test': 'e4-cancel' }
});
const sessionEId = sessionE.data.id;
console.log(`Session created: ${sessionEId}`);

const streamE = await client.sessions.createTurnStream(sessionEId, {
  input: [
    {
      type: 'user.message',
      content: 'Call echo_edit on example.txt to change "old" to "new".'
    }
  ]
});

let cancelDuringApprovalSuccess = false;
for await (const event of streamE) {
  console.log(`[Stream E Event] ${event.type}`);

  if (event.type === 'tool.approval_required') {
    console.log('>>> Approval requested! Instead of approving, cancelling session...');
    const cancelRes = await client.sessions.cancel(sessionEId);
    console.log('>>> Cancel response:', JSON.stringify(cancelRes));
    cancelDuringApprovalSuccess = true;
  }

  if (event.type === 'turn.done') {
    console.log('>>> Turn completed after cancel. Status:', event.state?.status);
  }
}

fs.writeFileSync('spike/logs/e4-verified.json', JSON.stringify({
  allowSuccess,
  denySuccess,
  cancelDuringApprovalSuccess,
  approvalEventA,
  toolCallsA: capturedToolCallArgs,
  eventsACount: allEventsA.length,
  eventsCCount: allEventsC.length
}, null, 2));

console.log('\nE4 EXPERIMENT COMPLETE! Logs written to spike/logs/e4-verified.json');
