# Awesome Skills

> A curated map of reusable AI skills for Claude, Codex, Cursor, Gemini CLI, GitHub Copilot, OpenCode, Windsurf, and other agentic tools.

**Language:** English | [Simplified Chinese](README.zh-CN.md)

AI skills are reusable instruction packages, workflows, prompts, tool guides, or small capability bundles that help AI agents perform specific tasks reliably. This repository focuses on high-signal skill catalogs, official skill libraries, domain skill packs, and discovery tools rather than one-off prompt snippets.

## Contents

- [What Is A Skill?](#what-is-a-skill)
- [How To Use This List](#how-to-use-this-list)
- [Official & Standards](#official--standards)
- [Curated Collections](#curated-collections)
- [Platform-Specific Libraries](#platform-specific-libraries)
- [Domain Skill Packs](#domain-skill-packs)
- [Tools, Directories & Discovery](#tools-directories--discovery)
- [Contribution Guidelines](#contribution-guidelines)
- [Resources](#resources)
- [License](#license)

## What Is A Skill?

A skill teaches an AI agent how to perform a repeatable task. Depending on the platform, a skill may be a `SKILL.md` folder, a reusable prompt, a command workflow, an MCP/tool integration guide, a project template, or a packaged capability.

Good skills usually have:

- A clear task and activation scenario.
- Practical instructions written for an AI agent.
- Examples, constraints, and known failure modes.
- Public source or documentation.
- A license or clear usage terms.

## How To Use This List

Start with official libraries and standards if you are new to skills. Use curated collections when you want a broad survey, platform-specific libraries when you already know your agent host, and domain packs when you need deeper expertise for a workflow.

Use this format when adding entries:

```md
- [Name](https://example.com) - One-sentence description. Works with: Claude, Codex.
```

## Official & Standards

- [Agent Skills Specification](https://github.com/agentskills/agentskills) - Specification and documentation for the open Agent Skills format. Works with: standards-compatible agents.
- [Anthropic Skills](https://github.com/anthropics/skills) - Anthropic's public repository of Agent Skills examples, document skills, templates, and the Agent Skills spec. Works with: Claude, Claude Code, Claude API.
- [GitHub Awesome Copilot](https://github.com/github/awesome-copilot) - Community collection of Copilot agents, instructions, skills, hooks, workflows, plugins, and tools. Works with: GitHub Copilot.
- [Hugging Face Skills](https://github.com/huggingface/skills) - Skills for Hugging Face tasks such as dataset work, model search, evaluation, training, Hub automation, Gradio, and Transformers.js. Works with: Claude Code, Codex, Gemini CLI, Cursor.
- [Microsoft Skills](https://github.com/microsoft/skills) - Skills, custom agents, AGENTS.md templates, and MCP configurations for Azure SDKs and Microsoft AI Foundry. Works with: GitHub Copilot and other skills-compatible coding agents.
- [OpenAI Skills](https://github.com/openai/skills) - Official skills catalog for Codex, including system, curated, and experimental skills. Works with: Codex.
- [Supabase Agent Skills](https://github.com/supabase/agent-skills) - Agent Skills for Supabase development and Postgres best practices. Works with: Claude Code, GitHub Copilot, Cursor, Cline, and other compatible agents.

## Curated Collections

- [Awesome Agent Skills](https://github.com/VoltAgent/awesome-agent-skills) - Large curated collection of official and community Agent Skills across many teams and tools. Works with: Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot, OpenCode, Windsurf.
- [Awesome Agent Skills by Skillmatic](https://github.com/skillmatic-ai/awesome-agent-skills) - Learning-oriented roadmap for understanding, using, building, evaluating, and discovering Agent Skills. Works with: standards-compatible agents.
- [Awesome Claude Skills by Composio](https://github.com/ComposioHQ/awesome-claude-skills) - Broad collection of Claude Skills, plugins, examples, and app automation workflows. Works with: Claude, Codex, Cursor, Gemini CLI, Antigravity, Windsurf.
- [Awesome Claude Skills by Karan B](https://github.com/karanb192/awesome-claude-skills) - Curated Claude Skills list with categories for testing, debugging, development, documentation, media, data, and meta skills. Works with: Claude Code, Claude.ai, Claude API.
- [Awesome Claude Code And Skills](https://github.com/GetBindu/awesome-claude-code-and-skills) - Curated collection of Claude skills, agents, tools, and learning resources for development workflows. Works with: Claude.
- [Awesome Skills by Intellectronica](https://github.com/intellectronica/awesome-skills) - Directory of AI agent skills with generated JSON/YAML data and a browsable HTML view. Works with: Claude and agents using Skillz MCP.
- [Antigravity Awesome Skills](https://github.com/sickn33/antigravity-awesome-skills) - Installable library of agentic `SKILL.md` playbooks, bundles, workflows, and practical docs. Works with: Claude Code, Cursor, Codex CLI, Gemini CLI, Antigravity, OpenCode, GitHub Copilot.

## Platform-Specific Libraries

- [Awesome Codex Skills](https://github.com/ComposioHQ/awesome-codex-skills) - Curated Codex skills for development, collaboration, writing, data analysis, and app automation. Works with: Codex.
- [Claude Code Skills & Plugins](https://github.com/alirezarezvani/claude-skills) - Large multi-tool library of Claude Code skills, plugins, agents, personas, and conversion scripts. Works with: Claude Code, Codex, Gemini CLI, Cursor, OpenCode, Windsurf, Antigravity.
- [Codex Skills Library](https://github.com/proflead/codex-skills-library) - Focused reusable Codex skills for developer workflows such as debugging, testing, API work, infra, security, performance, reliability, and planning. Works with: Codex.

## Domain Skill Packs

- [Agent Skills by Addy Osmani](https://github.com/addyosmani/agent-skills) - Production-grade engineering skills for AI coding agents. Works with: AI coding agents.
- [Obsidian Skills](https://github.com/kepano/obsidian-skills) - Agent Skills for Obsidian Markdown, Bases, JSON Canvas, CLI workflows, and web-to-markdown extraction. Works with: Claude Code, Codex CLI, OpenCode.
- [Scientific Agent Skills](https://github.com/K-Dense-AI/scientific-agent-skills) - Large research and science skill pack covering scientific databases, Python packages, data analysis, bioinformatics, chemistry, medicine, engineering, and scientific writing. Works with: Cursor, Claude Code, Codex, and standards-compatible agents.

## Tools, Directories & Discovery

- [GitHub Topic: agent-skills](https://github.com/topics/agent-skills) - GitHub topic for repositories using or publishing Agent Skills. Works with: discovery.
- [GitHub Topic: claude-skills](https://github.com/topics/claude-skills) - GitHub topic for Claude Skills repositories and related skill packs. Works with: discovery.
- [GitHub Topic: codex-skills](https://github.com/topics/codex-skills) - GitHub topic for Codex Skills repositories and compatible skill packs. Works with: discovery.
- [Skillshare](https://github.com/runkids/skillshare) - Tool for syncing skills across AI CLI tools and teams. Works with: Codex, Claude Code, OpenClaw, and more.

## Contribution Guidelines

We welcome pull requests and issue submissions. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before adding a new skill.

In general, submissions should be:

- Publicly accessible.
- Useful for real workflows.
- Clearly documented.
- Not a duplicate of an existing entry.
- Not primarily promotional.

## Resources

- [Claude Code Skills documentation](https://code.claude.com/docs/en/skills)
- [OpenAI Codex Skills documentation](https://developers.openai.com/codex/skills/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Awesome Lists](https://github.com/sindresorhus/awesome)

## License

This repository is licensed under the [Apache License 2.0](LICENSE).

Individual linked projects may use different licenses. Always check the original project before using or redistributing a skill.
