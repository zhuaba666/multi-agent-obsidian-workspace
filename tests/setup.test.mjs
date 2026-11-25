import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, runSetup } from '../scripts/setup-multi-agent-vault.mjs';

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('runSetup deploys rules and MCP configs across all three clients and creates backups', () => {
  const sandbox = makeTempDir('maow-test-');
  try {
    const fakeHome = path.join(sandbox, 'home');
    const fakeVault = path.join(sandbox, 'vault');
    const fakeSpec = path.join(sandbox, 'cos-vfx');
    const fakeArch = path.join(sandbox, 'archive');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeVault, { recursive: true });

    // Pre-seed existing configs to verify backups and non-destructive merge
    fs.mkdirSync(path.join(fakeHome, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(fakeHome, '.codex', 'config.toml'),
      'model = "gpt-6.1"\n\n[mcp_servers.other]\ncommand = "echo"\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(fakeHome, '.claude.json'),
      JSON.stringify({ existingKey: 42, mcpServers: { existing: { command: 'foo', args: [] } } }),
      'utf8'
    );

    const opts = parseArgs([
      '--vault',
      fakeVault,
      '--specialized-vault',
      fakeSpec,
      '--archive-vault',
      fakeArch,
      '--home',
      fakeHome,
    ]);
    const results = runSetup(opts);
    assert.equal(results.length, 3);

    // Verify Antigravity rule & MCP JSON
    const agyRule = fs.readFileSync(path.join(fakeHome, '.gemini', 'config', 'rules', 'zcode-vault.md'), 'utf8');
    assert.match(agyRule, new RegExp(fakeVault.replace(/\\/g, '\\\\')));
    const agyMcp = JSON.parse(fs.readFileSync(path.join(fakeHome, '.gemini', 'config', 'mcp_config.json'), 'utf8'));
    assert.ok(agyMcp.mcpServers.zcode_vault);

    // Verify Claude rule, existing key preservation, and backup
    const claudeRule = fs.readFileSync(path.join(fakeHome, '.claude', 'CLAUDE.md'), 'utf8');
    assert.match(claudeRule, /git worktree/);
    const claudeJson = JSON.parse(fs.readFileSync(path.join(fakeHome, '.claude.json'), 'utf8'));
    assert.equal(claudeJson.existingKey, 42);
    assert.ok(claudeJson.mcpServers.existing);
    assert.ok(claudeJson.mcpServers.zcode_vault);
    const claudeBackups = fs.readdirSync(fakeHome).filter((n) => n.startsWith('.claude.json.bak-'));
    assert.equal(claudeBackups.length, 1);

    // Verify Codex AGENTS.md, TOML section upsert, and idempotency on second run
    const codexRule = fs.readFileSync(path.join(fakeHome, '.codex', 'AGENTS.md'), 'utf8');
    assert.match(codexRule, /zcode_vault/);
    runSetup(opts); // second run should replace existing section cleanly without duplicating header
    const codexToml = fs.readFileSync(path.join(fakeHome, '.codex', 'config.toml'), 'utf8');
    assert.equal(codexToml.match(/\[mcp_servers\.zcode_vault\]/g)?.length, 1);
    assert.match(codexToml, /\[mcp_servers\.other\]/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('runSetup dryRun does not write target files', () => {
  const sandbox = makeTempDir('maow-dry-');
  try {
    const fakeHome = path.join(sandbox, 'home');
    const fakeVault = path.join(sandbox, 'vault');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeVault, { recursive: true });

    const opts = parseArgs(['--vault', fakeVault, '--home', fakeHome, '--dry-run']);
    const results = runSetup(opts);
    assert.equal(results.length, 3);
    assert.equal(fs.existsSync(path.join(fakeHome, '.claude', 'CLAUDE.md')), false);
    assert.equal(fs.existsSync(path.join(fakeHome, '.codex', 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(fakeHome, '.gemini', 'config', 'rules', 'zcode-vault.md')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
