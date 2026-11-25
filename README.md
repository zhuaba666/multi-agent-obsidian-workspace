# Multi-Agent Obsidian Workspace

一套面向 **Antigravity + Codex + Claude Code** 三端协同的轻量级工作空间与 Obsidian 知识库配置方案：
**三端共享同一个精简后的 Obsidian 主知识库（作为统一“外脑”），同时各自遵守独立精简规则与工作区隔离边界，互不打架。**

---

## 核心流程

```text
你的需求
  │
  ├─► 1. 启动自动加载：三端读取各自规则 + 挂载同一套 zcode_vault MCP
  │      • Antigravity : ~/.gemini/config/rules/zcode-vault.md + mcp_config.json
  │      • Claude Code : ~/.claude/CLAUDE.md + ~/.claude.json
  │      • Codex       : ~/.codex/AGENTS.md + ~/.codex/config.toml
  │
  ├─► 2. 先查库再动手：回答或立项前先检索 Obsidian 主库，无记录再联网
  │
  ├─► 3. 分工与隔离执行：
  │      • Claude      : 总控架构、综合审查、将纠偏固化为类型检查/测试
  │      • Codex       : 在独立 git worktree / 指定目录内并发写代码并自测
  │      • Antigravity : 调研、只读审查、浏览器/界面验证与方案对照
  │
  └─► 4. 自动增量沉淀：有效结论与排障经验按日期增量写回主库（不覆盖原笔记、不存敏感信息）
```

---

## 为什么这套结构好用？

1. **三份规则各自完整、极度精简**：参考多模型协同实践，不为追求“一份文件走天下”而写含糊规则；同主题下 `CLAUDE.md`、`AGENTS.md`、`zcode-vault.md` 按各自模型习惯维护，共有规则同步更新，规则里只写“做什么 / 不做什么”，不堆砌流水账。
2. **踩坑优先转成机械检查**：能用类型检查、测试或目录边界拦住的问题，不靠文字规则反复提醒。
3. **Obsidian 知识库分层瘦身**：
   - **主库**：只保留长期可复用的技术经验、配置方案、项目核心决策（三端统一挂载）。
   - **专业库 / 归档库**：如 3D/VFX 专项知识、课程与竞赛档案拆成独立仓库，按需打开。
   - **原始 GitHub 源码仓库**：移出 Obsidian 库外（如 `RAW_SOURCES_Archive/`），避免成千上万个 `.py` / 测试文件拖慢检索与 MCP 访问。

---

## 目录结构

```text
multi-agent-obsidian-workspace/
├── scripts/
│   ├── setup-multi-agent-vault.mjs   # 一键同步三端规则并接入 filesystem MCP（自动备份原配置）
│   └── split-obsidian-vault.ps1      # Obsidian 知识库瘦身与拆分脚本（支持 -DryRun 与可恢复备份）
├── templates/
│   ├── rules/
│   │   ├── CLAUDE.md                 # Claude 全局规则模板
│   │   ├── AGENTS.md                 # Codex 全局规则模板
│   │   └── zcode-vault.md            # Antigravity 全局规则模板
│   └── mcp/
│       └── mcp-config-snippet.json   # MCP 配置参考片段
├── tests/
│   └── setup.test.mjs                # 基于 node:test 的沙盒自动化测试
├── LICENSE                           # MIT
└── README.md
```

---

## 快速开始

### 前置依赖
- [Node.js](https://nodejs.org/) >= 20.0.0
- 一个本地 Obsidian 知识库目录（作为主库）

### 1. （可选）对臃肿的 Obsidian 知识库先做预览与拆分

```powershell
# 先演练预览（不会改动任何文件）
pwsh -File scripts/split-obsidian-vault.ps1 -MainVault "E:\MyVaults\main" -DryRun

# 确认无误后正式执行（空占位文件会移入 _vault_backup，可恢复）
pwsh -File scripts/split-obsidian-vault.ps1 -MainVault "E:\MyVaults\main"
```

### 2. 一键同步三端规则并接入 MCP

```bash
# 预览模式（不写入文件）
node scripts/setup-multi-agent-vault.mjs --vault "E:\MyVaults\main" --dry-run

# 正式部署（默认使用 npx -y @modelcontextprotocol/server-filesystem，并在修改前自动备份原配置）
node scripts/setup-multi-agent-vault.mjs \
  --vault "E:\MyVaults\main" \
  --specialized-vault "E:\MyVaults\COS_VFX_Knowledge" \
  --archive-vault "E:\MyVaults\Archive"
```

如果你已经在本地安装了 `@modelcontextprotocol/server-filesystem`（避免每次 `npx` 启动慢），可通过 `--server` 指定本地入口：

```bash
node scripts/setup-multi-agent-vault.mjs \
  --vault "E:\MyVaults\main" \
  --server "C:\path\to\node_modules\@modelcontextprotocol\server-filesystem\dist\index.js"
```

### 3. 运行测试

```bash
npm test
```

---

## 安全与隐私约定

- 部署脚本修改任何已有配置文件（`~/.claude.json`、`~/.codex/config.toml`、`~/.gemini/config/mcp_config.json` 及规则文件）前，都会自动生成带时间戳的 `.bak-*` 备份。
- 知识库规则明确禁止把 API Token、密码、会话密钥写入笔记或公开仓库。
- `zcode_vault` MCP 默认**仅授权主库目录**，不要把包含大量第三方源码或敏感配置的目录暴露给日常 MCP。

---

## 致谢（Acknowledgements）

本工作流的多 Agent 协同设计思路（三端独立精简规则、`git worktree` / 只读权限隔离、以及“能用检查拦住的就不写文字规则”的工程原则）深受 **数字生命卡兹克（[@Khazix0918](https://x.com/Khazix0918)）** 的分享启发，在此特别致谢！

- 灵感来源长文：[《毫无保留地分享一下，我是如何让Claude、GPT和Gemini完美协同的》](https://x.com/Khazix0918/status/2124680457623425334)
- 作者开源技能合集：[KKKKhazix/khazix-skills](https://github.com/KKKKhazix/khazix-skills)（MIT License）

## License

[MIT](./LICENSE)
