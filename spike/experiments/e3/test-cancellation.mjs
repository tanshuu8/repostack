// spike/experiments/e3/test-cancellation.mjs
import { TrueForge } from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/18da9bb0c07c9a14/node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs';
import * as fs from 'node:fs';

const client = new TrueForge({ baseUrl: 'http://localhost:8790' });

console.log('=== EXPERIMENT E3: CANCELLATION & WORKSPACE STATE ===\n');

// 1. Create a session for cancellation test
const sessionRes = await client.sessions.create({
  agent: { name: 'spike-streaming' },
  metadata: { 'spike.experiment': 'e3' }
});
const sessionId = sessionRes.data.id;
console.log(`Session created: ${sessionId}`);

// Scenario A: Cancel during active model generation
console.log('\n--- Scenario A: Cancellation during generation ---');
const turnStart = Date.now();
const stream = await client.sessions.createTurnStream(sessionId, {
  input: [
    {
      type: 'user.message',
      content: 'Write a comprehensive 2000-word essay explaining the history and future of distributed consensus algorithms in great detail.'
    }
  ]
});

let cancelled = false;
let cancelCallTime = null;
let lastEventTime = null;
const events = [];

try {
  for await (const event of stream) {
    const now = Date.now();
    lastEventTime = now;
    events.push({ timeMs: now - turnStart, type: event.type });
    console.log(`[Stream Event] +${now - turnStart}ms: ${event.type}`);

    // Once we receive the first delta, trigger cancellation
    if (event.type === 'model.message.delta' && !cancelled) {
      cancelled = true;
      cancelCallTime = Date.now();
      console.log(`>>> ISSUING client.sessions.cancel(${sessionId}) at +${cancelCallTime - turnStart}ms...`);
      const cancelRes = await client.sessions.cancel(sessionId);
      console.log('>>> Cancel response:', cancelRes);
    }
  }
} catch (err) {
  console.log(`Stream ended with error/abort: ${err.message}`);
}

const finalDuration = Date.now() - turnStart;
const cancellationLagMs = lastEventTime && cancelCallTime ? lastEventTime - cancelCallTime : 0;
console.log(`Stream completed. Time from cancel call to last event: ${cancellationLagMs}ms`);

// 2. Inspect session status after cancellation
const sessionAfter = await client.sessions.get(sessionId);
console.log('Session status after cancel:', sessionAfter.data.lastTurnDetails?.state?.status);

// 3. Inspect turn details
const turns = await client.sessions.listTurns(sessionId);
const cancelledTurn = turns.data?.[0];
console.log('Turn state after cancel:', JSON.stringify(cancelledTurn?.state));

// 4. Test session reusability: can a new turn be submitted on the same session?
console.log('\n--- Testing Session Reusability After Cancellation ---');
let reusedSuccess = false;
let reuseError = null;
try {
  const reuseStream = await client.sessions.createTurnStream(sessionId, {
    input: [
      {
        type: 'user.message',
        content: 'Say hello in 3 words.'
      }
    ]
  });

  for await (const ev of reuseStream) {
    if (ev.type === 'turn.done') {
      reusedSuccess = true;
      console.log('Reuse turn completed successfully! Output:', ev.state?.output?.content?.slice(0, 100));
    }
  }
} catch (err) {
  reuseError = err.message;
  console.log('Reuse turn failed:', err.message);
}

const e3Results = {
  sessionId,
  cancelled,
  cancelCallTimeFromStart: cancelCallTime ? cancelCallTime - turnStart : null,
  cancellationLagMs,
  turnStateAfterCancel: cancelledTurn?.state,
  sessionStatusAfterCancel: sessionAfter.data.lastTurnDetails?.state?.status,
  sessionReusability: { success: reusedSuccess, error: reuseError },
  events
};

fs.writeFileSync('spike/logs/e3.json', JSON.stringify(e3Results, null, 2));
console.log('\nSaved E3 results to spike/logs/e3.json');

