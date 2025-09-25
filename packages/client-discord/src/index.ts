import {
    elizaLogger,
    Character,
    Client as ElizaClient,
    IAgentRuntime,
} from "@elizaos/core";
import { Client, Events, GatewayIntentBits, Guild, Partials, PermissionsBitField } from "discord.js";
import { EventEmitter } from "events";

import chat_with_attachments from "./actions/chat_with_attachments.ts";
import joinvoice from "./actions/joinvoice.ts";
import leavevoice from "./actions/leavevoice.ts";
import summarize from "./actions/summarize_conversation.ts";
import transcribe_media from "./actions/transcribe_media.ts";
import { MessageManager } from "./messages.ts";
import channelStateProvider from "./providers/channelState.ts";
import voiceStateProvider from "./providers/voiceState.ts";
import { VoiceManager } from "./voice.ts";

export class DiscordClient extends EventEmitter {
    apiToken: string;
    client: Client;
    runtime: IAgentRuntime;
    character: Character;
    private messageManager: MessageManager;
    private voiceManager: VoiceManager;

    constructor(runtime: IAgentRuntime) {
        super();

        this.apiToken = runtime.getSetting("DISCORD_API_TOKEN") as string;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessageTyping,
                GatewayIntentBits.GuildMessageTyping,
                GatewayIntentBits.GuildMessageReactions,
            ],
            partials: [
                Partials.Channel,
                Partials.Message,
                Partials.User,
                Partials.Reaction,
            ],
        });

        this.runtime = runtime;
        this.voiceManager = new VoiceManager(this);
        this.messageManager = new MessageManager(this, this.voiceManager);

        this.client.once(Events.ClientReady, this.onClientReady.bind(this));
        this.client.login(this.apiToken);

        this.setupEventListeners();

        this.runtime.registerAction(joinvoice);
        this.runtime.registerAction(leavevoice);
        this.runtime.registerAction(summarize);
        this.runtime.registerAction(chat_with_attachments);
        this.runtime.registerAction(transcribe_media);

        this.runtime.providers.push(channelStateProvider);
        this.runtime.providers.push(voiceStateProvider);
    }

    private setupEventListeners() {
        // When joining to a new server
        this.client.on("guildCreate", this.handleGuildCreate.bind(this));

        this.client.on(
            "voiceStateUpdate",
            this.voiceManager.handleVoiceStateUpdate.bind(this.voiceManager)
        );
        this.client.on(
            "userStream",
            this.voiceManager.handleUserStream.bind(this.voiceManager)
        );

        // Handle a new message with the message manager
        this.client.on(
            Events.MessageCreate,
            this.messageManager.handleMessage.bind(this.messageManager)
        );

        // Handle a new interaction
        this.client.on(
            Events.InteractionCreate,
            this.handleInteractionCreate.bind(this)
        );
    }

    async stop() {
        try {
            // disconnect websocket
            // this unbinds all the listeners
            await this.client.destroy();
        } catch (e) {
            elizaLogger.error("client-discord instance stop err", e);
        }
    }

    private async onClientReady(readyClient: { user: { tag: any; id: any } }) {
        elizaLogger.success(`Logged in as ${readyClient.user?.tag}`);

        // Register slash commands
        const commands = [
            {
                name: "joinchannel",
                description: "Join a voice channel",
                options: [
                    {
                        name: "channel",
                        type: 7, // CHANNEL type
                        description: "The voice channel to join",
                        required: true,
                        channel_types: [2], // GuildVoice type
                    },
                ],
            },
            {
                name: "leavechannel",
                description: "Leave the current voice channel",
            },
        ];

        try {
            await this.client.application?.commands.set(commands);
            elizaLogger.success("Slash commands registered");
        } catch (error) {
            elizaLogger.error("Error registering slash commands:", error);
        }

        // Required permissions for the bot
        const requiredPermissions = [
            // Text Permissions
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.SendMessagesInThreads,
            PermissionsBitField.Flags.CreatePrivateThreads,
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.UseExternalEmojis,
            PermissionsBitField.Flags.UseExternalStickers,
            PermissionsBitField.Flags.MentionEveryone,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            // Voice Permissions
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.UseVAD,
            PermissionsBitField.Flags.PrioritySpeaker,
        ].reduce((a, b) => a | b, 0n);

        elizaLogger.success("Use this URL to add the bot to your server:");
        elizaLogger.success(
            `https://discord.com/api/oauth2/authorize?client_id=${readyClient.user?.id}&permissions=${requiredPermissions}&scope=bot%20applications.commands`
        );
        await this.onReady();
    }

    private handleGuildCreate(guild: Guild) {
        elizaLogger.log(`Joined guild ${guild.name}`);
        this.voiceManager.scanGuild(guild);
    }

    private async handleInteractionCreate(interaction: any) {
        if (!interaction.isCommand()) return;

        switch (interaction.commandName) {
            case "joinchannel":
                await this.voiceManager.handleJoinChannelCommand(interaction);
                break;
            case "leavechannel":
                await this.voiceManager.handleLeaveChannelCommand(interaction);
                break;
        }
    }

    private async onReady() {
        const guilds = await this.client.guilds.fetch();
        for (const [, guild] of guilds) {
            const fullGuild = await guild.fetch();
            this.voiceManager.scanGuild(fullGuild);
        }
    }
}

export function startDiscord(runtime: IAgentRuntime) {
    return new DiscordClient(runtime);
}

export const DiscordClientInterface: ElizaClient = {
    start: async (runtime: IAgentRuntime) => new DiscordClient(runtime),
    stop: async (runtime: IAgentRuntime) => {
        try {
            // stop it
            elizaLogger.log("Stopping discord client", runtime.agentId);
            await runtime.clients.discord.stop();
        } catch (e) {
            elizaLogger.error("client-discord interface stop error", e);
        }
    },
};
