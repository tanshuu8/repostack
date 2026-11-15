// spike/experiments/e2/test-streaming.mjs
import { TrueForge } from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/18da9bb0c07c9a14/node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs';

const client = new TrueForge({ baseUrl: 'http://localhost:8790' });

console.log('=== EXPERIMENT E2: SESSION, STREAMING & EVENT SCHEMA ===\n');

// 1. Ensure spike-streaming agent exists
const AGENT_NAME = 'spike-streaming';
let agent;

try {
  const existing = await client.agents.list({ agentName: AGENT_NAME });
  agent = existing.data?.find(a => a.name === AGENT_NAME);
  if (!agent) {
    console.log(`Creating agent "${AGENT_NAME}"...`);
    const created = await client.agents.create({
      name: AGENT_NAME,
      description: 'Temporary agent for Experiment E2 streaming verification',
      manifest: {
        model: {
          name: 'google-gemini/gemini-3-1-flash-lite',
          params: { reasoningEffort: 'low' }
        },
        instructions: 'You are a helpful coding assistant. When asked, write a 5-step checklist for Python code review.'
      }
    });
    agent = created.data;
    console.log(`Created agent "${AGENT_NAME}" with ID: ${agent.id}`);
  } else {
    console.log(`Found existing agent "${AGENT_NAME}" with ID: ${agent.id}`);
  }
} catch (err) {
  console.error('Error finding/creating agent:', err.message, err.body);
  process.exit(1);
}

// 2. Create Session
const sessionStart = Date.now();
const sessionRes = await client.sessions.create({
  agent: { name: AGENT_NAME },
  metadata: { 'spike.experiment': 'e2' }
});
const sessionId = sessionRes.data.id;
console.log(`Session created in ${Date.now() - sessionStart}ms. Session ID: ${sessionId}`);

// 3. Initiate Streaming Turn
const turnStart = Date.now();
console.log('Initiating createTurnStream...');

const stream = await client.sessions.createTurnStream(sessionId, {
  input: [
    {
      type: 'user.message',
      content: 'Write a 5-step checklist for Python code review. Keep each step to one concise sentence.'
    }
  ]
});

const events = [];
const eventTypes = new Set();
const deltaTimings = [];
let firstEventTime = null;
let firstDeltaTime = null;
let lastDeltaTime = null;
let fullText = '';

for await (const event of stream) {
  const now = Date.now();
  if (firstEventTime === null) firstEventTime = now - turnStart;
  
  eventTypes.add(event.type);
  events.push({
    timeFromStartMs: now - turnStart,
    type: event.type,
    summary: JSON.stringify(event).slice(0, 300)
  });

  // Check for delta
  if (event.type === 'model.message.delta') {
    if (firstDeltaTime === null) firstDeltaTime = now - turnStart;
    const interval = lastDeltaTime ? now - lastDeltaTime : 0;
    lastDeltaTime = now;
    
    const deltaText = event.content ?? '';
    const reasoningText = event.reasoningContent ?? '';
    fullText += deltaText;
    deltaTimings.push({
      timeMs: now - turnStart,
      intervalMs: interval,
      contentLength: deltaText.length,
      hasReasoning: !!reasoningText,
      finishReason: event.finishReason ?? null
    });
  }
}

const totalDuration = Date.now() - turnStart;

console.log('\n--- STREAMING SUMMARY ---');
console.log(`Total duration: ${totalDuration}ms`);
console.log(`Time to first event: ${firstEventTime}ms`);
console.log(`Time to first text delta: ${firstDeltaTime}ms`);
console.log(`Total events received: ${events.length}`);
console.log(`Distinct event types (${eventTypes.size}):`, Array.from(eventTypes));
console.log(`Total delta chunks received: ${deltaTimings.length}`);
if (deltaTimings.length > 1) {
  const avgInterval = deltaTimings.slice(1).reduce((acc, d) => acc + d.intervalMs, 0) / (deltaTimings.length - 1);
  console.log(`Average inter-delta interval: ${avgInterval.toFixed(1)}ms`);
}

console.log('\n--- FIRST 5 DELTA TIMINGS ---');
console.log(deltaTimings.slice(0, 5));

console.log('\n--- DISTINCT EVENT SAMPLES ---');
for (const type of eventTypes) {
  const sample = events.find(e => e.type === type);
  console.log(`\n[EVENT: ${type}] (at ${sample.timeFromStartMs}ms):`);
  console.log(sample.summary);
}

// Write raw log to e2.json
import * as fs from 'node:fs';
fs.writeFileSync('spike/logs/e2.json', JSON.stringify({
  sessionId,
  totalDuration,
  firstEventTime,
  firstDeltaTime,
  eventTypes: Array.from(eventTypes),
  deltaCount: deltaTimings.length,
  deltaTimings,
  events
}, null, 2));

console.log('\nSaved full event trace to spike/logs/e2.json');
