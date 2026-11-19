/**
 * Experiment E4D: 5-Minute Pending Tool Approval Session Liveness Test.
 */
// spike/experiments/e4/test-5min-pending.mjs
import { TrueForge } from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/18da9bb0c07c9a14/node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs';
import * as fs from 'node:fs';

const client = new TrueForge({ baseUrl: 'http://localhost:8790' });
console.log('=== EXPERIMENT E4D: 5-MINUTE PENDING APPROVAL DURATION TEST ===\n');

const session = await client.sessions.create({
  agent: { name: 'spike-approval' },
  metadata: { 'spike.test': 'e4d-5min' }
});
const sessionId = session.data.id;
console.log(`Session created: ${sessionId}`);

const stream = await client.sessions.createTurnStream(sessionId, {
  input: [
    {
      type: 'user.message',
      content: 'Call echo_edit on example.txt to change "old" to "new".'
    }
  ]
});

let currentTurnId = null;
let pendingEvent = null;

for await (const event of stream) {
  if (event.type === 'turn.created') {
    currentTurnId = event.turnId ?? event.id;
  }
  if (event.type === 'tool.approval_required') {
    pendingEvent = event;
    console.log(`Tool approval required captured at ${new Date().toISOString()} for toolCallId: ${event.toolCalls?.[0]?.id}`);
    break; // Break from stream loop to begin holding
  }
}

if (!pendingEvent) {
  console.error('Failed to capture pending approval');
  process.exit(1);
}

const toolCallId = pendingEvent.toolCalls[0].id;
const threadId = pendingEvent.threadId;

console.log('Holding approval pending for 305 seconds (5 minutes + 5s margin)...');
const startTime = Date.now();

// Poll turn status every 60 seconds
for (let minute = 1; minute <= 5; minute++) {
  await new Promise(r => setTimeout(r, 60000));
  const turnInfo = await client.sessions.getTurn(sessionId, currentTurnId);
  console.log(`[T+${minute}m] Turn status: ${turnInfo.data?.state?.status}, requiredActions: ${turnInfo.data?.state?.requiredActions?.length}`);
}

const totalHeldSeconds = Math.round((Date.now() - startTime) / 1000);
console.log(`Held for ${totalHeldSeconds}s. Now attempting to submit approval allow...`);

let resolveSuccess = false;
let resolveError = null;

try {
  const res = await client.sessions.createTurnEvent(sessionId, currentTurnId, {
    events: [
      {
        type: 'user.tool_approval',
        threadId,
        toolCallId,
        approval: { status: 'allow' }
      }
    ]
  });
  console.log('SUCCESS resolving after 5 minutes! Response:', JSON.stringify(res));
  resolveSuccess = true;
} catch (err) {
  console.error('FAILED resolving after 5 minutes:', err.message, err.body);
  resolveError = err.message;
}

// Check final turn status
const finalTurn = await client.sessions.getTurn(sessionId, currentTurnId);
console.log('Final turn state:', JSON.stringify(finalTurn.data?.state));

fs.writeFileSync('spike/logs/e4d-5min.json', JSON.stringify({
  sessionId,
  currentTurnId,
  totalHeldSeconds,
  resolveSuccess,
  resolveError,
  finalTurnState: finalTurn.data?.state
}, null, 2));

console.log('E4D results saved to spike/logs/e4d-5min.json');

