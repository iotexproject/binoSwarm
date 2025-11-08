# Bino Swarm 🐐

_The autonomous agent framework that doesn't mess around. Build once, deploy everywhere._

**Powered by [Quicksilver](https://github.com/iotexproject/quicksilver.git)** — our open-source framework that bridges Large Language Models (LLMs) with Decentralized Physical Infrastructure Networks (DePINs) to create advanced AI agents.

_Originally forked from [ElizaOS](https://github.com/elizaOS/eliza) — credits to the pioneering work that laid the foundation._

**See it in action:** [@Bino_AI](https://x.com/Bino_AI) • [@Caila_AI](https://x.com/Caila_AI) • [@NodeyICN](https://x.com/NodeyICN)

## 📋 Table of Contents

- [✨ What You Get](#-what-you-get)
- [🎯 What You'll Build](#-what-youll-build)
- [🚀 3-Minute Setup (No, Really)](#-3-minute-setup-no-really)
- [🛠️ For the Brave: Build From Source](#️-for-the-brave-build-from-source)
- [📚 Feed Your Agent Knowledge](#-feed-your-agent-knowledge)
- [🎭 Character Data Sources](#-character-data-sources)

## ✨ What You Get

- 🛠️ **Multi-platform domination:** Discord, Twitter, Telegram — your agents go where the action is
- 🧠 **Model buffet:** Grok, OpenAI, Anthropic, Gemini — pick your poison, we'll make it work
- 📚 **Document devouring:** Feed it anything. PDFs, docs, websites — it reads faster than you and remembers everything
- 💾 **Privacy-first memory:** Smart retention that remembers what matters, forgets what doesn't. Auto-deletes old data and wipes everything on user request
- 🔧 **Infinitely hackable:** Built to be broken apart and rebuilt. Create custom actions, clients, whatever your heart desires
- 📦 **MCP ready:** Connect your own servers because vendor lock-in is for the weak

## 🎯 What You'll Build

- 🤖 **Chatbots with brains** — no more "I don't understand" responses
- 🕵️ **Digital workforce** — agents that actually get stuff done while you sleep
- 📈 **Business automation** — because manual processes are so 2020
- 🛡️ **Brand guardians** — agents that know your brand inside-out, hunt down scammers, and turn FUDders into believers
- 🎮 **NPCs that aren't braindead** — give your game characters actual personality
- 🧠 **Trading bots** — automate your way to financial freedom (not financial advice, just good code)

## 🚀 3-Minute Setup (No, Really)

### What You Need

- [Python 2.7+](https://www.python.org/downloads/)
- [Node.js 23+](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [pnpm](https://pnpm.io/installation)

> **Windows folks:** You know the drill. [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install-manual) or bust.

### The Steps (Don't Skip Any)

1. **Give your agent a personality:** Copy `characters/trump.character.json` to `characters/my-character.json` and make it interesting. Boring agents are useless agents.

2. **Handle your secrets:** Copy `.env.example` to `.env` and fill in your API keys.

    ```bash
    cp .env.example .env
    ```

    _Pro tip: Skip the `.env` if you're feeling brave — pass secrets through character JSON instead._

3. **Grab the Docker blueprint:** Copy `docker-compose.yaml` to your project root.

4. **Point it in the right direction:** Edit `docker-compose.yaml` to use your character:

    ```yaml
    services:
        bino:
            image: ghcr.io/iotexproject/bino:latest # Latest and greatest
            command:
                ["pnpm", "start", "--character=characters/my-character.json"]
    # ... rest of your config ...
    ```

5. **Fire it up:**

    ```bash
    docker compose up
    ```

    Watch your digital offspring come to life. If it breaks, that's what logs are for.

## 🛠️ For the Brave: Build From Source

Want to get your hands dirty? Add your own features? Break things properly? Skip the Docker and build it yourself.

### Clone and Conquer

```bash
git clone https://github.com/iotexproject/binoSwarm.git binoSwarm
cd binoSwarm
```

### Set Up Your Playground

1. **Handle secrets:** Same as above — copy `.env.example` to `.env` and fill it out.

2. **Create your character:** Copy and customize a character file just like the Docker setup.

3. **Build the beast:**

    ```bash
    pnpm i --no-frozen-lockfile && pnpm build
    ```

4. **Let it rip:**

    ```bash
    pnpm start --character=characters/binotest.json
    ```

Now you're running raw code. Break it, fix it, make it better. Pull requests welcome.

## 📚 Feed Your Agent Knowledge

Your agent is only as smart as what you teach it. Time to make it an expert.

### The Knowledge Vault

Drop your knowledge files into `characters/knowledge/`. Markdown files work great.

### Link External Knowledge

Got a knowledge base in another GitHub repo? Don't copy-paste like a peasant — link it:

```bash
# Clone your knowledge repo outside the project
git clone https://github.com/your-org/your-docs.git
cd binoSwarm

# Create a symbolic link
ln -s ../your-docs characters/knowledge/your-docs
```

### Tell Your Agent What to Read

Update your `character.json` to point to the knowledge files:

```json
"knowledge": [
    {
        "path": "iotex2-docs/README.md",
        "shared": false
    },
    {
        "path": "iotex2-docs/depin-infra-modules-dim/ioconnect-hardware-sdk/README.md",
        "shared": false
    }
]
```

Now your agent knows everything you know. Scary? Maybe. Useful? Absolutely.

## 🎭 Character Data Sources

Your agent's personality comes from multiple sources, merged in a specific order. Here's how it works:

### The Loading Hierarchy

When you start an agent, character data is loaded and merged in this order:

1. **Default Character** (`packages/core/src/defaultCharacter.ts`)
   - Used when no character JSON path is provided
   - Provides a baseline "Eliza" character with default traits
   - Includes system prompt, bio, lore, message examples, and style

2. **Character JSON File** (`characters/*.json`)
   - Loaded when you specify `--character=characters/my-character.json`
   - Defines core character properties: name, model provider, plugins, clients
   - Can include initial traits, but these get enriched by subsequent sources

3. **Filesystem Traits** (`characters/agentsTraits/<characterName>/`)
   - **Primary source** for character traits (bio, lore, knowledge, templates, etc.)
   - Loaded from a directory matching the character's `name` field
   - Structure mirrors GitHub repo format (see below)
   - If found, traits are merged with the character JSON

4. **Database Traits** (PostgreSQL fallback)
   - **Fallback** when filesystem traits directory doesn't exist
   - Maintains backwards compatibility with existing deployments
   - Traits stored in `characters` table with `is_published = true`

### How It Works (HIW)

The merge process follows this flow:

```text
Start Agent
    ↓
Load Character JSON (or use default)
    ↓
Check: Does `characters/agentsTraits/<characterName>/` exist?
    ├─ YES → Load traits from filesystem → Merge → Done
    └─ NO → Check database for traits → Merge → Done
```

**Important:** Filesystem traits take precedence over database traits. If both exist, filesystem wins.

### GitHub Repo Integration

The filesystem traits directory structure matches a GitHub repository format. Here's how to set it up:

#### Repository Structure

Your character traits repo should follow this structure:

```text
your-character-repo/
├── bio.json                 # Array of biography strings
├── lore.json                # Array of lore strings
├── knowledge.json           # Array of knowledge paths (strings or objects)
├── messageExamples.json     # Nested array of message examples
├── postExamples.json        # Array of post example strings
├── topics.json              # Array of topic strings
├── adjective.json            # Array of adjective strings
├── style.json               # Style object with all/chat/post arrays
├── templates.json           # Template names mapped to file paths
├── xTargetUsers.txt         # One username per line
├── xKnowledgeUsers.txt      # One username per line
└── prompts/
    ├── system.md            # System prompt (becomes system_prompt)
    ├── goals.md             # Template (becomes templates.goalsTemplate)
    └── *.md                 # Other templates
```

#### Setting Up the Symlink

1. **Clone your character traits repo:**

   ```bash
   git clone https://github.com/your-org/your-character-repo.git
   ```

2. **Create a symlink in the project:**

   ```bash
   cd binoSwarm
   ln -s ../your-character-repo characters/agentsTraits/your-character-name
   ```

   The directory name must match the `name` field in your character JSON.

#### Template Files

The `templates.json` file maps template names to file paths:

```json
{
    "goalsTemplate": "./prompts/goals.md",
    "twitterQSPrompt": "./prompts/twitterQS.md",
    "memeSystemPrompt": "./prompts/memeSystem.md"
}
```

The loader reads these files and stores their content in `character.templates`.

#### Knowledge Files

`knowledge.json` can contain either:

- Simple strings: `["path/to/file.md"]`
- Objects with paths: `[{"path": "path/to/file.md", "shared": false}]`

Both formats are supported and converted to string arrays during loading.
