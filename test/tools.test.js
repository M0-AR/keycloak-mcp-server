/**
 * Smoke tests for the tool contract, run against the built server over stdio.
 *
 * These need no Keycloak instance: `tools/list` is answered from the tool table alone,
 * and the connection to Keycloak is made lazily per tool call. So this is cheap enough
 * to run on every commit.
 *
 * Why this particular shape of test. The bugs that motivated it were all silent: a field
 * accepted by the advertised inputSchema but dropped before it reached Keycloak, so the
 * call returned success having done something other than what was asked. Nothing crashed
 * and no error surfaced, which is exactly why code review missed them. Asserting on the
 * advertised contract is the cheapest way to catch a regression of that kind -- if a field
 * disappears from inputSchema, callers stop being able to reach it, and that is a
 * behaviour change worth failing a build over.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');

/** Speak just enough MCP over stdio to get the tool list back. */
async function listTools() {
  const proc = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // Point at a port nothing is listening on: reaching Keycloak would mean the server
    // is connecting at startup, which this test would rather find out about than mask.
    env: { ...process.env, KEYCLOAK_URL: 'http://127.0.0.1:1' },
  });

  const send = (msg) => proc.stdin.write(JSON.stringify(msg) + '\n');
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' },
  }});
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for tools/list')), 15000);
      let buffered = '';
      proc.stdout.on('data', (chunk) => {
        buffered += chunk;
        for (const line of buffered.split('\n').slice(0, -1)) {
          if (!line.trim()) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.id === 2 && msg.result) {
            clearTimeout(timer);
            resolve(msg.result.tools);
          }
        }
        buffered = buffered.slice(buffered.lastIndexOf('\n') + 1);
      });
      proc.on('error', reject);
      proc.on('exit', (code) => reject(new Error(`server exited early with code ${code}`)));
    });
  } finally {
    proc.kill();
  }
}

const tools = await listTools();
const byName = new Map(tools.map((t) => [t.name, t]));

const props = (name) => {
  const tool = byName.get(name);
  assert.ok(tool, `tool ${name} is not registered`);
  return tool.inputSchema.properties ?? {};
};

test('server registers tools without reaching Keycloak', () => {
  assert.ok(tools.length > 0, 'expected a non-empty tool list');
});

test('client tools accept the fields a SAML client needs', () => {
  // Each of these was silently dropped by the 7-field whitelist, which made SAML clients
  // impossible to create: the result was an OIDC client with fullScopeAllowed defaulted on.
  for (const tool of ['create-client', 'update-client']) {
    const p = props(tool);
    for (const field of ['protocol', 'attributes', 'protocolMappers', 'fullScopeAllowed',
                         'alwaysDisplayInConsole', 'baseUrl', 'webOrigins']) {
      assert.ok(p[field], `${tool} should accept ${field}`);
    }
    assert.equal(byName.get(tool).inputSchema.additionalProperties, true,
      `${tool} should not reject fields outside its documented list`);
  }
});

test('update-client does not promise more than it accepts', () => {
  // The description advertised protocol mappers while the schema had no such field.
  const tool = byName.get('update-client');
  if (/protocol mapper/i.test(tool.description)) {
    assert.ok(props('update-client').protocolMappers,
      'description mentions protocol mappers, so the schema must accept protocolMappers');
  }
});

test('role tools can address client roles, not just realm roles', () => {
  for (const tool of ['assign-role-to-user', 'remove-role-from-user',
                      'assign-role-to-group', 'remove-role-from-group',
                      'find-users-with-role', 'list-available-group-roles']) {
    assert.ok(props(tool).clientId, `${tool} should accept clientId to target a client role`);
  }
});

test('client roles can be enumerated', () => {
  const p = props('list-client-roles');
  assert.ok(p.realm && p.clientId, 'list-client-roles should take realm and clientId');
});

test('role-reading tools document that they return client mappings too', () => {
  // These return { realmMappings, clientMappings }. Saying so in the description matters
  // because the previous realm-only behaviour was indistinguishable from "no roles".
  for (const tool of ['get-user-roles', 'get-group-roles']) {
    assert.match(byName.get(tool).description, /clientMappings/,
      `${tool} should document its return shape`);
  }
});

test('create-group still advertises parentId', () => {
  // Guards against the field being dropped from the contract. Note what this does NOT
  // cover: parentId was advertised here all along and ignored by the handler, so a
  // tools/list assertion cannot see that bug at all. Catching it needs a real call against
  // a live Keycloak -- worth adding if this repo ever grows an integration suite.
  assert.ok(props('create-group').parentId, 'create-group should accept parentId');
});

test('no tool advertises a required field it does not declare', () => {
  // Cheap structural invariant across all ~80 tools: a required field that is absent from
  // properties can never be supplied correctly by a caller.
  for (const tool of tools) {
    const declared = Object.keys(tool.inputSchema.properties ?? {});
    for (const field of tool.inputSchema.required ?? []) {
      assert.ok(declared.includes(field),
        `${tool.name} requires ${field} but does not declare it in properties`);
    }
  }
});
