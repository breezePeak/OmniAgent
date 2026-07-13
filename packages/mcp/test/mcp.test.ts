import assert from 'node:assert/strict';
import test from 'node:test';
import {
  McpProvider,
  createEchoServer,
  createMemoryNotesServer,
  parseQualifiedName,
  qualifyToolName,
} from '../src/index.js';

test('connects builtin servers and lists qualified tools', async () => {
  const provider = new McpProvider();
  await provider.connect({ id: 'echo', name: 'Echo', kind: 'echo' }, createEchoServer());
  await provider.connect({ id: 'notes', name: 'Notes', kind: 'memory-notes' }, createMemoryNotesServer());

  const tools = provider.listTools().map((tool) => tool.qualifiedName).sort();
  assert.deepEqual(tools, [
    'mcp.echo.echo',
    'mcp.notes.notes.list',
    'mcp.notes.notes.read',
    'mcp.notes.notes.write',
  ]);
});

test('calls MCP tools and converts them into tool-like contracts', async () => {
  const provider = new McpProvider();
  await provider.connect({ id: 'notes', name: 'Notes', kind: 'memory-notes' }, createMemoryNotesServer());

  await provider.callTool('mcp.notes.notes.write', { key: 'todo', value: 'ship mcp' });
  const read = await provider.callTool('mcp.notes.notes.read', { key: 'todo' });
  assert.deepEqual(read, { key: 'todo', value: 'ship mcp' });

  const tool = provider.toToolDefinitions().find((item) => item.name === 'mcp.notes.notes.write');
  assert.ok(tool);
  const result = await tool!.execute({ key: 'todo', value: 'updated' });
  assert.deepEqual(result, { key: 'todo', value: 'updated' });
});

test('parses qualified MCP tool names', () => {
  assert.equal(qualifyToolName('echo', 'ping'), 'mcp.echo.ping');
  assert.deepEqual(parseQualifiedName('mcp.notes.notes.write'), {
    serverId: 'notes',
    toolName: 'notes.write',
  });
});
