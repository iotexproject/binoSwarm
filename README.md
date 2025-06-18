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
