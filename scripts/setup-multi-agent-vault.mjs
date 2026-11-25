#!/usr/bin/env node
/**
 * Multi-Agent Workspace & Obsidian Vault Setup Script
 * Synchronizes global rules and filesystem MCP configuration across:
 *   - Antigravity (~/.gemini/config/rules & mcp_config.json)
 *   - Claude Code (~/.claude/CLAUDE.md & ~/.claude.json)
 *   - Codex (~/.codex/AGENTS.md & ~/.codex/config.toml)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Parse CLI arguments into an options object.
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const opts = {
    vault: '',
    specializedVault: '',
    archiveVault: '',
    mcpName: 'zcode_vault',
    serverEntry: '',
    nodeExec: process.execPath,
    home: os.homedir(),
    targets: ['antigravity', 'claude', 'codex'],
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--vault':
        opts.vault = next ?? '';
        i++;
        break;
      case '--specialized-vault':
        opts.specializedVault = next ?? '';
        i++;
        break;
      case '--archive-vault':
        opts.archiveVault = next ?? '';
        i++;
        break;
      case '--mcp-name':
        opts.mcpName = next || 'zcode_vault';
        i++;
        break;
      case '--server':
        opts.serverEntry = next ?? '';
        i++;
        break;
      case '--node':
        opts.nodeExec = next || process.execPath;
        i++;
        break;
      case '--home':
        opts.home = next || os.homedir();
        i++;
        break;
      case '--targets':
        opts.targets = (next ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        i++;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage:
  node scripts/setup-multi-agent-vault.mjs --vault <MAIN_VAULT_PATH> [options]

Options:
  --vault <path>              Main Obsidian vault directory (required)
  --specialized-vault <path>  Optional specialized sub-vault path for rules
  --archive-vault <path>      Optional archive sub-vault path for rules
  --mcp-name <name>           MCP server key name (default: zcode_vault)
  --server <path>             Local @modelcontextprotocol/server-filesystem dist/index.js
                              (if omitted, uses npx -y @modelcontextprotocol/server-filesystem)
  --node <path>               Node.js executable path when --server is provided
  --targets <list>            Comma-separated: antigravity,claude,codex (default: all)
  --home <dir>                Override user home directory (useful for testing)
  --dry-run                   Preview changes without writing files
  -h, --help                  Show this help message`);
}

/**
 * Render a template file with vault placeholders.
 */
function renderTemplate(templateName, vars) {
  const tplPath = path.join(REPO_ROOT, 'templates', 'rules', templateName);
  let text = fs.readFileSync(tplPath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}

/**
 * Create a timestamped backup next to targetPath if it already exists.
 */
function backupIfExists(targetPath, stamp, dryRun) {
  if (!fs.existsSync(targetPath)) return null;
  const backupPath = `${targetPath}.bak-${stamp}`;
  if (!dryRun) {
    fs.copyFileSync(targetPath, backupPath);
  }
  return backupPath;
}

/**
 * Write text to a file safely, creating parent directories and backing up existing content.
 */
function writeFileWithBackup(targetPath, content, stamp, dryRun) {
  const backupPath = backupIfExists(targetPath, stamp, dryRun);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
  }
  return { targetPath, backupPath };
}

/**
 * Build the JSON MCP server entry (used by Antigravity and Claude Code).
 */
function buildJsonMcpEntry({ vaultPath, serverEntry, nodeExec }) {
  if (serverEntry) {
    return {
      command: nodeExec,
      args: [serverEntry, vaultPath],
    };
  }
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', vaultPath],
  };
}

/**
 * Merge mcpServers.<mcpName> into a JSON config file.
 */
function upsertJsonMcpConfig(configPath, mcpName, entry, stamp, dryRun) {
  let obj = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8').trim();
    if (raw) {
      obj = JSON.parse(raw);
      if (!obj || Array.isArray(obj) || typeof obj !== 'object') {
        throw new Error(`Invalid JSON root object in ${configPath}`);
      }
    }
  }
  if (obj.mcpServers && (Array.isArray(obj.mcpServers) || typeof obj.mcpServers !== 'object')) {
    throw new Error(`Invalid mcpServers object in ${configPath}`);
  }
  obj.mcpServers = obj.mcpServers || {};
  obj.mcpServers[mcpName] = entry;
  return writeFileWithBackup(configPath, JSON.stringify(obj, null, 2) + '\n', stamp, dryRun);
}

/**
 * Escape a string for a TOML literal string ('...').
 */
function toTomlLiteral(str) {
  if (!str.includes("'")) return `'${str}'`;
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Upsert [mcp_servers.<mcpName>] section in Codex config.toml.
 */
function upsertCodexTomlMcp(tomlPath, mcpName, entry, stamp, dryRun) {
  const existing = fs.existsSync(tomlPath) ? fs.readFileSync(tomlPath, 'utf8') : '';
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const header = `[mcp_servers.${mcpName}]`;
  const argsList = entry.args.map(toTomlLiteral).join(', ');
  const section = [
    header,
    `command = ${toTomlLiteral(entry.command)}`,
    `args = [${argsList}]`,
    'startup_timeout_sec = 30.0',
  ].join(eol);

  const lines = existing ? existing.split(/\r?\n/) : [];
  const startIdx = lines.findIndex((line) => line.trim() === header);
  let nextText;

  if (startIdx >= 0) {
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^\s*\[/.test(lines[i])) {
        endIdx = i;
        break;
      }
    }
    const updatedLines = [
      ...lines.slice(0, startIdx),
      ...section.split(eol),
      ...lines.slice(endIdx),
    ];
    nextText = updatedLines.join(eol).trimEnd() + eol;
  } else {
    const trimmed = existing.trimEnd();
    nextText = trimmed ? `${trimmed}${eol}${eol}${section}${eol}` : `${section}${eol}`;
  }

  return writeFileWithBackup(tomlPath, nextText, stamp, dryRun);
}

/**
 * Deploy synchronized rules and MCP configs across selected targets.
 */
export function runSetup(opts) {
  if (!opts.vault) {
    throw new Error('Missing required option: --vault <MAIN_VAULT_PATH>');
  }
  const vaultPath = path.resolve(opts.vault);
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Vault path does not exist: ${vaultPath}`);
  }
  const serverEntry = opts.serverEntry ? path.resolve(opts.serverEntry) : '';
  if (serverEntry && !fs.existsSync(serverEntry)) {
    throw new Error(`MCP server entry does not exist: ${serverEntry}`);
  }

  const vars = {
    MAIN_VAULT: vaultPath,
    SPECIALIZED_VAULT: opts.specializedVault ? path.resolve(opts.specializedVault) : '（未单独配置，可按需挂载）',
    ARCHIVE_VAULT: opts.archiveVault ? path.resolve(opts.archiveVault) : '（未单独配置，可按需挂载）',
    MCP_NAME: opts.mcpName,
  };

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const mcpEntry = buildJsonMcpEntry({
    vaultPath,
    serverEntry,
    nodeExec: opts.nodeExec,
  });

  const results = [];
  const targets = new Set(opts.targets);

  if (targets.has('antigravity')) {
    const ruleRes = writeFileWithBackup(
      path.join(opts.home, '.gemini', 'config', 'rules', `${opts.mcpName.replace(/_/g, '-')}.md`),
      renderTemplate('zcode-vault.md', vars),
      stamp,
      opts.dryRun
    );
    const mcpRes = upsertJsonMcpConfig(
      path.join(opts.home, '.gemini', 'config', 'mcp_config.json'),
      opts.mcpName,
      mcpEntry,
      stamp,
      opts.dryRun
    );
    results.push({ target: 'antigravity', ruleRes, mcpRes });
  }

  if (targets.has('claude')) {
    const ruleRes = writeFileWithBackup(
      path.join(opts.home, '.claude', 'CLAUDE.md'),
      renderTemplate('CLAUDE.md', vars),
      stamp,
      opts.dryRun
    );
    const mcpRes = upsertJsonMcpConfig(
      path.join(opts.home, '.claude.json'),
      opts.mcpName,
      mcpEntry,
      stamp,
      opts.dryRun
    );
    results.push({ target: 'claude', ruleRes, mcpRes });
  }

  if (targets.has('codex')) {
    const ruleRes = writeFileWithBackup(
      path.join(opts.home, '.codex', 'AGENTS.md'),
      renderTemplate('AGENTS.md', vars),
      stamp,
      opts.dryRun
    );
    const mcpRes = upsertCodexTomlMcp(
      path.join(opts.home, '.codex', 'config.toml'),
      opts.mcpName,
      mcpEntry,
      stamp,
      opts.dryRun
    );
    results.push({ target: 'codex', ruleRes, mcpRes });
  }

  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      printHelp();
      process.exit(0);
    }
    const results = runSetup(opts);
    console.log(JSON.stringify({ ok: true, dryRun: opts.dryRun, results }, null, 2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
