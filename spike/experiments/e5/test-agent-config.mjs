/**
 * Experiment E5: Consolidated Agent Instructions & MCP Connector Verification.
 */
// spike/experiments/e5/test-agent-config.mjs
import { TrueForge } from 'file:///C:/Users/user/AppData/Local/npm-cache/_npx/18da9bb0c07c9a14/node_modules/@truefoundry/trueforge-sdk/dist/esm/index.mjs';
import * as fs from 'node:fs';

const client = new TrueForge({ baseUrl: 'http://localhost:8790' });
console.log('=== EXPERIMENT E5: AGENT INSTRUCTIONS AND MCP INTEGRATION ===\n');

// 1. Fetch repostackv1 and v2 to inspect their definitions
const allAgents = await client.agents.list();
const v1 = allAgents.data?.find(a => a.name === 'repostackv1');
const v2 = allAgents.data?.find(a => a.name === 'v2');

console.log('repostackv1 instructions length:', v1?.manifest?.instructions?.length ?? 0);
console.log('v2 mcpServers count:', v2?.manifest?.mcpServers?.length ?? 0);

// 2. Create spike-agent combining both
const AGENT_NAME = 'spike-agent';
let spikeAgent;

const existing = allAgents.data?.find(a => a.name === AGENT_NAME);
if (existing) {
  spikeAgent = existing;
  console.log(`Found existing "${AGENT_NAME}" with ID: ${spikeAgent.id}`);
} else {
  console.log(`Creating "${AGENT_NAME}" combining v1 instructions and v2 connector...`);
  const created = await client.agents.create({
    name: AGENT_NAME,
    description: 'Consolidated agent definition for RepoStack with full instructions and MCP tools',
    manifest: {
      model: {
        name: 'google-gemini/gemini-3-1-flash-lite',
        params: { reasoningEffort: 'low' }
      },
      instructions: v1.manifest.instructions,
      mcpServers: [
        {
          name: 'repostack-mcp',
          enableTools: ['list_files', 'read_file', 'search_workspace'],
          disableTools: [],
          preloadTools: ['list_files', 'read_file', 'search_workspace'],
          requireApprovalForTools: [],
          preload: true,
        }
      ],
      config: {
        iterationLimit: 50,
        sandbox: { enabled: false, fileDownloads: true },
        dynamicSubAgents: { enabled: true },
        contextManagement: { compaction: { enabled: true }, largeToolResponse: { enabled: true } },
      }
    }
  });
  spikeAgent = created.data;
  console.log(`Successfully created "${AGENT_NAME}" with ID: ${spikeAgent.id}`);
}

// 3. Test agent with a task requiring repository discovery
console.log('\nRunning repository discovery turn on spike-agent...');
const session = await client.sessions.create({
  agent: { name: AGENT_NAME },
  metadata: { 'spike.test': 'e5-discovery' }
});

const stream = await client.sessions.createTurnStream(session.data.id, {
  input: [
    {
      type: 'user.message',
      content: 'Using your repository MCP tools, locate the main entry point file of mcp-server, read its contents, and tell me what port it runs on.'
    }
  ]
});

const toolCalls = [];
let finalResponse = '';

for await (const ev of stream) {
  if (ev.type === 'tool.response') {
    toolCalls.push(ev);
    console.log(`[Tool Response] toolCallId: ${ev.toolCallId}`);
  }
  if (ev.type === 'turn.done') {
    finalResponse = ev.state?.output?.content ?? '';
    console.log('\n[Agent Finished Turn]');
    console.log('Output preview:', finalResponse.slice(0, 300));
  }
}

// 4. Export sanitized agent definition to spike/agent-definition.json
const sanitizedExport = {
  name: spikeAgent.name,
  description: spikeAgent.description,
  manifest: {
    model: spikeAgent.manifest?.model,
    instructions: spikeAgent.manifest?.instructions?.slice(0, 500) + '... (truncated for preview)',
    instructionsTotalLength: spikeAgent.manifest?.instructions?.length,
    mcpServers: spikeAgent.manifest?.mcpServers,
    config: spikeAgent.manifest?.config
  },
  exportedAt: new Date().toISOString(),
  format: 'TrueForge Agent Manifest v0.182.0'
};

fs.writeFileSync('spike/agent-definition.json', JSON.stringify(sanitizedExport, null, 2));
console.log('\nSaved sanitized agent definition to spike/agent-definition.json');

fs.writeFileSync('spike/logs/e5.json', JSON.stringify({
  agentId: spikeAgent.id,
  sessionId: session.data.id,
  toolCallsCount: toolCalls.length,
  toolCalls,
  finalResponse
}, null, 2));

console.log('Saved E5 test logs to spike/logs/e5.json');

