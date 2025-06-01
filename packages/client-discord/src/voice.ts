import {
    Content,
    IAgentRuntime,
    Memory,
    ModelClass,
    ServiceType,
    UUID,
    composeContext,
    elizaLogger,
    stringToUuid,
    ITranscriptionService,
    ISpeechService,
    streamWithTools,
} from "@elizaos/core";
import {
    AudioPlayer,
    AudioReceiveStream,
    NoSubscriberBehavior,
    StreamType,
    VoiceConnection,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    getVoiceConnections,
    joinVoiceChannel,
    entersState,
} from "@discordjs/voice";
import {
    BaseGuildVoiceChannel,
    ChannelType,
    Client,
    Guild,
    GuildMember,
    VoiceChannel,
    VoiceState,
} from "discord.js";
import EventEmitter from "events";
import prism from "prism-media";
import { Readable, pipeline } from "stream";

import { DiscordClient } from "./index.ts";
import { discordVoiceHandlerTemplate } from "./templates.ts";
import { getWavHeader } from "./utils.ts";
import {
    qsSchema,
    GetHeadlinesToolSchema,
    CurrentWeatherToolSchema,
    ForecastWeatherToolSchema,
    CalculatorToolSchema,
    GetProjectsToolSchema,
    GetL1StatsToolSchema,
    GetL1DailyStatsToolSchema,
    GetCoordinatesToolSchema,
    GetLocationFromCoordinatesToolSchema,
    GetDirectionsToolSchema,
} from "@elizaos/plugin-depin";
import { AudioMonitor } from "./AudioMonitor.ts";
import { SileroVAD } from "./VAD.ts";

// These values are chosen for compatibility with picovoice components
const DECODE_FRAME_SIZE = 1024;
const DECODE_SAMPLE_RATE = 16000;
const SPEAKING_THRESHOLD = 0.6;
const DEBOUNCE_TRANSCRIPTION_THRESHOLD = 800;

type Message = {
    content: ResContent[];
    role: string;
    id: string;
};

type ResContent = {
    type: string;
    text?: string;
};

export class VoiceManager extends EventEmitter {
    private processingVoice: boolean = false;
    private transcriptionTimeout: NodeJS.Timeout | null = null;
    private userStates: Map<
        string,
        {
            buffers: Buffer[];
            totalLength: number;
            lastActive: number;
            transcriptionText: string;
            name: string;
            userName: string;
            channel: BaseGuildVoiceChannel;
        }
    > = new Map();
    private activeAudioPlayer: AudioPlayer | null = null;
    private client: Client;
    private runtime: IAgentRuntime;
    private streams: Map<string, Readable> = new Map();
    private connections: Map<string, VoiceConnection> = new Map();
    private activeMonitors: Map<
        string,
        { channel: BaseGuildVoiceChannel; monitor: AudioMonitor }
    > = new Map();
    private vadProcessors: Map<string, SileroVAD> = new Map();
    private userSpeechState: Map<string, boolean> = new Map();

    constructor(client: DiscordClient) {
        super();
        this.client = client.client;
        this.runtime = client.runtime;
        SileroVAD.create()
            .then((_vad) => {
                elizaLogger.log("Silero VAD pre-initialized.");
            })
            .catch((error) => {
                elizaLogger.error(
                    "Failed to pre-initialize Silero VAD: ",
                    error
                );
            });
    }

    async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;
        const member = newState.member;
        if (!member) return;
        if (member.id === this.client.user?.id) {
            return;
        }

        // Ignore mute/unmute events
        if (oldChannelId === newChannelId) {
            return;
        }

        // User leaving a channel where the bot is present
        if (oldChannelId && this.connections.has(oldChannelId)) {
            this.stopMonitoringMember(member.id);
        }

        // User joining a channel where the bot is present
        if (newChannelId && this.connections.has(newChannelId)) {
            await this.monitorMember(
                member,
                newState.channel as BaseGuildVoiceChannel
            );
        }
    }

    async joinChannel(channel: BaseGuildVoiceChannel) {
        const oldConnection = this.getVoiceConnection(
            channel.guildId as string
        );
        if (oldConnection) {
            try {
                oldConnection.destroy();
                // Remove all associated streams and monitors
                this.streams.clear();
                this.activeMonitors.clear();
            } catch (error) {
                elizaLogger.error("Error leaving voice channel:", error);
            }
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator as any,
            selfDeaf: false,
            selfMute: false,
            group: this.client.user.id,
        });

        try {
            const CONNECTION_TIMEOUT_MS = 20_000;
            // Wait for either Ready or Signalling state
            await Promise.race([
                entersState(
                    connection,
                    VoiceConnectionStatus.Ready,
                    CONNECTION_TIMEOUT_MS
                ),
                entersState(
                    connection,
                    VoiceConnectionStatus.Signalling,
                    CONNECTION_TIMEOUT_MS
                ),
            ]);

            // Log connection success
            elizaLogger.log(
                `Voice connection established in state: ${connection.state.status}`
            );

            // Set up ongoing state change monitoring
            connection.on("stateChange", async (oldState, newState) => {
                await this.handleOnStateChange(
                    oldState,
                    newState,
                    connection,
                    channel
                );
            });

            connection.on("error", (error) => {
                this.handleOnError(error);
            });

            // Store the connection
            this.connections.set(channel.id, connection);

            // Continue with voice state modifications
            const me = channel.guild.members.me;
            if (me?.voice && me.permissions.has("DeafenMembers")) {
                await this.undeafUnmute(me);
            }

            connection.receiver.speaking.on("start", async (userId: string) => {
                await this.handleOnStartSpeaking(channel, userId);
            });

            connection.receiver.speaking.on("end", async (userId: string) => {
                this.handleOnEndSpeaking(channel, userId);
            });
        } catch (error) {
            elizaLogger.log("Failed to establish voice connection:", error);
            connection.destroy();
            this.connections.delete(channel.id);
            throw error;
        }
    }

    private handleOnEndSpeaking(
        channel: BaseGuildVoiceChannel,
        userId: string
    ) {
        const user = channel.members.get(userId);
        if (!user?.user.bot) {
            this.streams.get(userId)?.emit("speakingStopped");
        }
    }

    private async handleOnStartSpeaking(
        channel: BaseGuildVoiceChannel,
        userId: string
    ) {
        let user = channel.members.get(userId);
        if (!user) {
            try {
                user = await channel.guild.members.fetch(userId);
            } catch (error) {
                elizaLogger.error("Failed to fetch user:", error);
            }
        }
        if (user && !user?.user.bot) {
            this.monitorMember(user as GuildMember, channel);
            this.streams.get(userId)?.emit("speakingStarted");
        }
    }

    private async undeafUnmute(me: GuildMember) {
        try {
            await me.voice.setDeaf(false);
            await me.voice.setMute(false);
        } catch (error) {
            elizaLogger.log("Failed to modify voice state:", error);
            // Continue even if this fails
        }
    }

    private handleOnError(error: Error) {
        elizaLogger.log("Voice connection error:", error);
        // Don't immediately destroy - let the state change handler deal with it
        elizaLogger.log("Connection error - will attempt to recover...");
    }

    private async handleOnStateChange(
        oldState,
        newState,
        connection: VoiceConnection,
        channel: BaseGuildVoiceChannel
    ) {
        elizaLogger.log(
            `Voice connection state changed from ${oldState.status} to ${newState.status}`
        );

        if (newState.status === VoiceConnectionStatus.Disconnected) {
            elizaLogger.log("Handling disconnection...");

            try {
                // Try to reconnect if disconnected
                await Promise.race([
                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5000
                    ),
                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5000
                    ),
                ]);
                // Seems to be reconnecting to a new channel
                elizaLogger.log("Reconnecting to channel...");
            } catch (e) {
                // Seems to be a real disconnect, destroy and cleanup
                elizaLogger.log("Disconnection confirmed - cleaning up..." + e);
                connection.destroy();
                this.connections.delete(channel.id);
            }
        } else if (newState.status === VoiceConnectionStatus.Destroyed) {
            this.connections.delete(channel.id);
        } else if (
            !this.connections.has(channel.id) &&
            (newState.status === VoiceConnectionStatus.Ready ||
                newState.status === VoiceConnectionStatus.Signalling)
        ) {
            this.connections.set(channel.id, connection);
        }
    }

    private getVoiceConnection(guildId: string) {
        const connections = getVoiceConnections(this.client.user.id);
        if (!connections) {
            return;
        }
        const connection = [...connections.values()].find(
            (connection) => connection.joinConfig.guildId === guildId
        );
        return connection;
    }

    private async monitorMember(
        member: GuildMember,
        channel: BaseGuildVoiceChannel
    ) {
        const userId = member?.id;
        const userName = member?.user?.username;
        const name = member?.user?.displayName;
        if (!userId || !userName || !name) {
            elizaLogger.warn("Could not get user details for monitoring");
            return;
        }

        if (this.streams.has(userId)) {
            elizaLogger.log(
                `monitorMember: Already monitoring user ${userId}, skipping redundant setup.`
            );
            return;
        }

        elizaLogger.log(
            `monitorMember: Starting monitoring setup for user ${userId}`
        );

        // Initialize VAD for this user
        if (!this.vadProcessors.has(userId)) {
            try {
                const vad = await SileroVAD.create();
                this.vadProcessors.set(userId, vad);
                this.userSpeechState.set(userId, false);
                elizaLogger.log(`Silero VAD initialized for user ${userId}`);
            } catch (error) {
                elizaLogger.error(
                    `Failed to initialize Silero VAD for user ${userId}: ${error}`
                );
                return;
            }
        }

        // Initialize user state if it doesn't exist (can happen if user joins before stream starts)
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, {
                buffers: [],
                totalLength: 0,
                lastActive: Date.now(),
                transcriptionText: "",
                name: name,
                userName: userName,
                channel: channel,
            });
        }

        const connection = this.getVoiceConnection(member?.guild?.id);

        if (!connection) {
            elizaLogger.error(
                `monitorMember: No voice connection found for guild ${member?.guild?.id} when trying to monitor ${userId}`
            );
            this.vadProcessors.delete(userId); // Clean up VAD if connection fails
            this.userSpeechState.delete(userId);
            return;
        }
        elizaLogger.log(
            `monitorMember: Connection status for ${userId} before subscribe: ${connection.state.status}`
        );

        const receiveStream = connection.receiver.subscribe(userId, {
            autoDestroy: true,
            emitClose: true,
        });

        if (!receiveStream) {
            elizaLogger.error(
                `monitorMember: connection.receiver.subscribe failed for user ${userId} (returned null/undefined)`
            );
            this.vadProcessors.delete(userId); // Clean up VAD
            this.userSpeechState.delete(userId);
            return;
        }

        elizaLogger.log(
            `monitorMember: Successfully subscribed to receive stream for user ${userId}. Setting up decoder.`
        );

        const opusDecoder = new prism.opus.Decoder({
            channels: 1,
            rate: DECODE_SAMPLE_RATE,
            frameSize: DECODE_FRAME_SIZE,
        });

        this.streams.set(userId, opusDecoder);
        this.connections.set(userId, connection);

        opusDecoder.on("data", async (pcmData: Buffer) => {
            await this.handleVADProcessing(userId, pcmData);
        });

        pipeline(
            receiveStream as AudioReceiveStream,
            opusDecoder as any,
            (err: Error | null) => {
                if (err) {
                    elizaLogger.log(
                        `Opus decoding pipeline error for ${userId}: ${err}`
                    );
                }
            }
        );

        const errorHandler = (err: any) => {
            elizaLogger.log(`Opus decoding error for ${userId}: ${err}`);
            streamCloseHandler();
        };

        const streamCloseHandler = () => {
            elizaLogger.log(
                `Stream/Decoder closed for user ${member?.displayName} (${userId})`
            );
            if (!this.streams.has(userId)) return;

            this.streams.delete(userId);
            this.vadProcessors.delete(userId);
            this.userSpeechState.delete(userId);
            this.connections.delete(userId);
            if (this.userStates.has(userId)) {
                this.userStates.delete(userId);
            }
            if (this.transcriptionTimeout) {
                clearTimeout(this.transcriptionTimeout);
                this.transcriptionTimeout = null;
            }
            opusDecoder.removeListener("data", this.handleVADProcessing);
            opusDecoder.removeListener("error", errorHandler);
            opusDecoder.removeListener("close", streamCloseHandler);
            receiveStream?.removeListener("close", streamCloseHandler);
            receiveStream?.destroy();
        };

        opusDecoder.on("error", errorHandler);
        opusDecoder.on("close", streamCloseHandler);
        receiveStream.on("close", streamCloseHandler);

        this.client.emit(
            "userStream",
            userId,
            name,
            userName,
            channel,
            opusDecoder
        );
    }

    private async handleVADProcessing(
        userId: string,
        pcmData: Buffer
    ): Promise<void> {
        const vad = this.vadProcessors.get(userId);
        const userState = this.userStates.get(userId);

        if (!vad || !userState) {
            elizaLogger.debug(
                `No VAD processor or user state ready for user ${userId}`
            );
            return;
        }

        try {
            // --- Continuous Buffering ---
            // Always push the latest PCM data to the buffer
            userState.buffers.push(pcmData);
            userState.totalLength += pcmData.length;
            userState.lastActive = Date.now();
            // Optional: Add logic here later to trim the buffer if it gets excessively long during prolonged silence
            // --- End Continuous Buffering ---

            const pcmFloat32 = SileroVAD.bufferToFloat32(pcmData);
            const speechProbability = await vad.process(pcmFloat32);

            if (speechProbability !== null) {
                const isSpeaking = speechProbability > SPEAKING_THRESHOLD;
                const wasSpeaking = this.userSpeechState.get(userId) || false;

                // --- Use VAD state change for logic ---
                if (isSpeaking && !wasSpeaking) {
                    // Transition: Silent -> Speaking
                    elizaLogger.debug(
                        `User ${userId} started speaking (Prob: ${speechProbability.toFixed(2)})`
                    );
                    // Clear any pending transcription timeout, user started talking again
                    if (this.transcriptionTimeout) {
                        clearTimeout(this.transcriptionTimeout);
                        this.transcriptionTimeout = null;
                        elizaLogger.debug(
                            `Cleared pending transcription timeout for ${userId} due to speech start.`
                        );
                    }
                } else if (!isSpeaking && wasSpeaking) {
                    // Transition: Speaking -> Silent
                    elizaLogger.debug(
                        `User ${userId} stopped speaking (Prob: ${speechProbability.toFixed(2)})`
                    );
                    // Trigger the transcription process after debounce period
                    this.debouncedProcessTranscription(
                        userId,
                        userState.name,
                        userState.userName
                    );
                }
                // --- End VAD state change logic ---

                // Update the state for the next check
                this.userSpeechState.set(userId, isSpeaking);
            }
        } catch (error) {
            elizaLogger.error(
                `Error processing VAD for user ${userId}: ${error}`
            );
            vad.reset();
            // Clear buffer on error?
            if (userState) {
                userState.buffers = [];
                userState.totalLength = 0;
            }
        }
    }

    leaveChannel(channel: BaseGuildVoiceChannel) {
        const connection = this.connections.get(channel.id);
        if (connection) {
            connection.destroy();
            this.connections.delete(channel.id);
        }
        // Stop monitoring all members in this channel
        for (const [memberId, monitorInfo] of this.activeMonitors) {
            if (
                monitorInfo.channel.id === channel.id &&
                memberId !== this.client.user?.id
            ) {
                this.stopMonitoringMember(memberId);
            }
        }
        elizaLogger.log(`Left voice channel: ${channel.name} (${channel.id})`);
    }

    stopMonitoringMember(memberId: string) {
        const monitorInfo = this.activeMonitors.get(memberId);
        if (monitorInfo) {
            monitorInfo.monitor.stop(); // Assuming monitor has a stop method
            this.activeMonitors.delete(memberId);
        }
        // Also clean up VAD, stream, connection, state associated with this memberId
        this.streams.delete(memberId);
        this.vadProcessors.delete(memberId);
        this.userSpeechState.delete(memberId);
        this.connections.delete(memberId);
        if (this.userStates.has(memberId)) {
            this.userStates.delete(memberId);
        }
        elizaLogger.log(`Stopped monitoring user ${memberId}`);
    }

    async handleGuildCreate(guild: Guild) {
        elizaLogger.log(`Joined guild ${guild.name}`);
        // this.scanGuild(guild);
    }

    async handleUserStream(
        userId: string,
        _name: string,
        _userName: string,
        _channel: BaseGuildVoiceChannel,
        _audioStream: Readable // Raw stream might be less relevant now
    ) {
        elizaLogger.log(
            `Handling user stream start trigger for user: ${userId}`
        );
        // User state initialization is now handled within monitorMember
        // Buffering is handled by handleVADProcessing via the opusDecoder 'data' event
    }

    private async debouncedProcessTranscription(
        userId: string,
        _name: string,
        _userName: string
    ) {
        // Prevent processing if bot is speaking or already processing
        if (
            this.activeAudioPlayer?.state?.status !== "idle" &&
            this.activeAudioPlayer
        ) {
            elizaLogger.log(
                "Bot is speaking, delaying transcription processing."
            );
            return;
        }
        if (this.processingVoice) {
            elizaLogger.log(
                "Already processing voice, delaying transcription processing."
            );
            return;
        }

        // Clear any existing timeout for this user (ensures only the latest silence triggers)
        if (this.transcriptionTimeout) {
            clearTimeout(this.transcriptionTimeout);
            elizaLogger.debug(
                `Cleared previous transcription timeout for ${userId}`
            );
        }

        // Since this function is now only called after silence is detected,
        // we can directly set the timeout.
        elizaLogger.debug(
            `Starting transcription timeout for ${userId} after silence.`
        );
        this.transcriptionTimeout = setTimeout(async () => {
            this.processingVoice = true;
            elizaLogger.log(`Transcription timeout fired for ${userId}`);
            try {
                const state = this.userStates.get(userId);
                if (state && state.channel && state.buffers.length > 0) {
                    await this.processTranscription(
                        userId,
                        state.channel.id,
                        state.channel,
                        state.name,
                        state.userName
                    );
                    if (this.userStates.has(userId)) {
                        this.userStates.get(userId)!.buffers = [];
                        this.userStates.get(userId)!.totalLength = 0;
                    }
                } else {
                    elizaLogger.warn(
                        `No state, channel, or buffers for user ${userId} during transcription timeout execution.`
                    );
                }
            } catch (error) {
                elizaLogger.error(
                    `Error during debounced transcription execution for ${userId}: ${error}`
                );
            } finally {
                this.processingVoice = false;
                this.transcriptionTimeout = null;
            }
        }, DEBOUNCE_TRANSCRIPTION_THRESHOLD);
    }

    private async processTranscription(
        userId: string,
        channelId: string,
        channel: BaseGuildVoiceChannel,
        name: string,
        userName: string
    ) {
        const state = this.userStates.get(userId);
        if (!state || state.buffers.length === 0) {
            elizaLogger.debug(
                `No user state or buffers for ${userId}, skipping transcription processing.`
            );
            return;
        }
        try {
            const inputBuffer = Buffer.concat(state.buffers, state.totalLength);
            // Clear buffers immediately before async call to prevent race conditions if user speaks again quickly
            // state.buffers = [];
            // state.totalLength = 0;
            // -> Moved buffer clearing to *after* processing in debouncedProcessTranscription
            elizaLogger.log(
                `Processing ${inputBuffer.length} bytes for transcription for user ${userId}`
            );

            const pcmWavBuffer = await this.convertPcmToWav(inputBuffer);

            elizaLogger.log("Starting transcription service call...");

            let rawBuffer = pcmWavBuffer.buffer;
            if (rawBuffer instanceof SharedArrayBuffer) {
                elizaLogger.debug(
                    "Converting SharedArrayBuffer to ArrayBuffer for transcription."
                );
                const newArrayBuffer = new ArrayBuffer(rawBuffer.byteLength);
                new Uint8Array(newArrayBuffer).set(new Uint8Array(rawBuffer));
                rawBuffer = newArrayBuffer;
            }
            // Ensure the slice operation uses the potentially new ArrayBuffer (rawBuffer)
            const arrayBufferForTranscription = rawBuffer.slice(
                pcmWavBuffer.byteOffset,
                pcmWavBuffer.byteOffset + pcmWavBuffer.byteLength
            );

            if (!(arrayBufferForTranscription instanceof ArrayBuffer)) {
                elizaLogger.error(
                    "Buffer conversion failed, expected ArrayBuffer!"
                );
                throw new Error(
                    "Failed to convert Buffer to ArrayBuffer for transcription"
                );
            }

            const transcriptionText = await this.runtime
                .getService<ITranscriptionService>(ServiceType.TRANSCRIPTION)
                .transcribe(arrayBufferForTranscription);

            elizaLogger.log(
                `Transcription result for ${userId}: ${transcriptionText ? `"${transcriptionText}"` : "null or empty"}`
            );

            function isValidTranscription(text: string): boolean {
                // Check for empty or explicit blank audio markers
                if (
                    !text ||
                    text.trim().length === 0 ||
                    text.includes("[BLANK_AUDIO]")
                )
                    return false;
                // Filter out short transcriptions that are likely noise
                if (text.trim().length < 3) return false;
                // Filter out transcriptions that are just sounds/noise markers
                const noisePatterns = [
                    /^s*[[({\w]*[\])}]\s*$/, // Text only in brackets/parentheses like [sound] or (noise)
                    /^s*[^a-zA-Z0-9]+\s*$/, // No alphanumeric characters
                    /^s*(um+|uh+|er+|hmm+)\s*$/i, // Just filler sounds
                    /^s*(inaudible|unintelligible|background noise)\s*$/i, // Explicitly marked as unintelligible
                ];
                if (noisePatterns.some((pattern) => pattern.test(text)))
                    return false;
                return true;
            }

            if (transcriptionText && isValidTranscription(transcriptionText)) {
                // Append to cumulative transcription text for the current utterance
                // state.transcriptionText += transcriptionText + " "; // Add space between segments
                // -> Simpler: process the whole buffer at once, no need to append
                const finalText = transcriptionText.trim(); // Use the full result directly
                state.transcriptionText = ""; // Reset for next utterance

                elizaLogger.log(
                    `Handling user message for ${userId}: "${finalText}"`
                );
                await this.handleUserMessage(
                    finalText,
                    userId,
                    channelId,
                    channel,
                    name,
                    userName
                );
            } else {
                elizaLogger.log(
                    `Transcription for ${userId} was invalid or empty, skipping message handling.`
                );
            }
        } catch (error) {
            elizaLogger.error(
                `Error processing transcription for user ${userId}:`,
                error
            );
        }
    }

    private async handleUserMessage(
        message: string,
        userId: string,
        channelId: string,
        channel: BaseGuildVoiceChannel,
        name: string,
        userName: string
    ) {
        try {
            const roomId = stringToUuid(channelId + "-" + this.runtime.agentId);
            const userIdUUID = stringToUuid(userId);

            await this.runtime.ensureConnection(
                userIdUUID,
                roomId,
                userName,
                name,
                "discord"
            );

            let state = await this.runtime.composeState(
                {
                    agentId: this.runtime.agentId,
                    content: { text: message, source: "Discord" },
                    userId: userIdUUID,
                    roomId,
                },
                {
                    discordChannel: channel,
                    discordClient: this.client,
                    agentName: this.runtime.character.name,
                },
                true
            );

            if (message && message.startsWith("/")) {
                return null;
            }

            const memoryId = stringToUuid(
                channelId + "-voice-message-" + Date.now()
            );
            const memory = {
                id: memoryId,
                agentId: this.runtime.agentId,
                content: {
                    text: message,
                    source: "discord",
                    url: channel.url,
                },
                userId: userIdUUID,
                roomId,
                createdAt: Date.now(),
            };

            if (!memory.content.text) {
                return { text: "", action: "IGNORE" };
            }

            await this.runtime.messageManager.createMemory({
                memory,
                isUnique: true,
            });

            state = await this.runtime.updateRecentMessageState(state);

            const shouldIgnore = this._shouldIgnore(memory);

            if (shouldIgnore) {
                return { text: "", action: "IGNORE" };
            }

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates
                        ?.directVoiceStreamTemplate ||
                    this.runtime.character.templates
                        ?.discordVoiceHandlerTemplate ||
                    this.runtime.character.templates?.messageHandlerTemplate ||
                    discordVoiceHandlerTemplate,
            });

            const result = this._generateResponse(context);

            for await (const textPart of result.textStream) {
                const responseStream = await this.runtime
                    .getService<ISpeechService>(ServiceType.SPEECH_GENERATION)
                    .generate(this.runtime, textPart);
                await this.playAudioStream(
                    userId as UUID,
                    responseStream as Readable
                );
            }

            const response = await result.response;

            // Explicitly type replyToId as UUID
            const replyToId: UUID = memory.id;

            this.processAssistantMessages(
                response.messages,
                this.runtime,
                roomId,
                replyToId
            );
        } catch (error) {
            elizaLogger.error("Error processing transcribed text:", error);
        }
    }

    private async processAssistantMessages(
        messages: Message[],
        runtime: IAgentRuntime,
        roomId: UUID,
        inReplyTo: UUID
    ) {
        messages.forEach(({ content, role, id }: Message) => {
            if (role === "assistant") {
                this.processMessageContents(
                    id,
                    runtime,
                    roomId,
                    content,
                    inReplyTo
                );
            }
        });
    }

    private async processMessageContents(
        messageId: string,
        runtime: IAgentRuntime,
        roomId: UUID,
        content: ResContent[],
        inReplyTo: UUID
    ) {
        content.forEach(({ type, text }: ResContent) => {
            if (type === "text") {
                const content: Content = {
                    text,
                    inReplyTo,
                };
                this.buildAndSaveMemory(messageId, runtime, roomId, content);
            }
        });
    }

    private async buildAndSaveMemory(
        messageId: string,
        runtime: IAgentRuntime,
        roomId: UUID,
        content: Content
    ) {
        const agentId = runtime.agentId;

        const responseMessage: Memory = {
            id: stringToUuid(messageId + "-" + agentId),
            roomId,
            userId: agentId,
            agentId,
            content,
            createdAt: Date.now(),
        };

        elizaLogger.info("streamedVoiceMessage", responseMessage);

        await runtime.messageManager.createMemory({
            memory: responseMessage,
            isUnique: true,
        });
    }

    private async convertPcmToWav(pcmBuffer: Buffer): Promise<Buffer> {
        try {
            // Use imported function
            const wavHeader = getWavHeader(
                pcmBuffer.length,
                DECODE_SAMPLE_RATE,
                1 // Mono channel
            );
            const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
            return wavBuffer;
        } catch (error) {
            elizaLogger.error("Error converting PCM to WAV:", error);
            throw error;
        }
    }

    private _generateResponse(context: string): any {
        elizaLogger.debug("context: ", context);
        const response = streamWithTools({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.FAST,
            tools: [
                qsSchema,
                GetCoordinatesToolSchema,
                GetLocationFromCoordinatesToolSchema,
                GetDirectionsToolSchema,
                GetHeadlinesToolSchema,
                ForecastWeatherToolSchema,
                CurrentWeatherToolSchema,
                GetL1StatsToolSchema,
                GetL1DailyStatsToolSchema,
                GetProjectsToolSchema,
                CalculatorToolSchema,
            ],
            smoothStreamBy: /[.!?]\s+/,
            customSystemPrompt:
                "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.",
        });

        return response;
    }

    private _shouldIgnore(message: Memory): boolean {
        elizaLogger.debug("message.content: ", message.content);
        // if the message is 3 characters or less, ignore it
        if ((message.content as Content).text.length < 3) {
            return true;
        }

        const loseInterestWords = [
            // telling the bot to stop talking
            "shut up",
            "stop",
            "dont talk",
            "silence",
            "stop talking",
            "be quiet",
            "hush",
            "stfu",
            "stupid bot",
            "dumb bot",

            // offensive words
            "fuck",
            "shit",
            "damn",
            "suck",
            "dick",
            "cock",
            "sex",
            "sexy",
        ];
        if (
            (message.content as Content).text.length < 50 &&
            loseInterestWords.some((word) =>
                (message.content as Content).text?.toLowerCase().includes(word)
            )
        ) {
            return true;
        }

        const ignoreWords = ["k", "ok", "bye", "lol", "nm", "uh"];
        if (
            (message.content as Content).text?.length < 8 &&
            ignoreWords.some((word) =>
                (message.content as Content).text?.toLowerCase().includes(word)
            )
        ) {
            return true;
        }

        return false;
    }

    async scanGuild(guild: Guild) {
        let chosenChannel: BaseGuildVoiceChannel | null = null;

        try {
            const channelId = this.runtime.getSetting(
                "DISCORD_VOICE_CHANNEL_ID"
            ) as string;
            if (channelId) {
                const channel = await guild.channels.fetch(channelId);
                if (channel?.isVoiceBased()) {
                    chosenChannel = channel as BaseGuildVoiceChannel;
                }
            }

            if (!chosenChannel) {
                const channels = (await guild.channels.fetch()).filter(
                    (channel) => channel?.type == ChannelType.GuildVoice
                );
                for (const [, channel] of channels) {
                    const voiceChannel = channel as BaseGuildVoiceChannel;
                    if (
                        voiceChannel.members.size > 0 &&
                        (chosenChannel === null ||
                            voiceChannel.members.size >
                                chosenChannel.members.size)
                    ) {
                        chosenChannel = voiceChannel;
                    }
                }
            }

            if (chosenChannel) {
                elizaLogger.log(`Joining channel: ${chosenChannel.name}`);
                await this.joinChannel(chosenChannel);
            } else {
                elizaLogger.warn("No suitable voice channel found to join.");
            }
        } catch (error) {
            elizaLogger.error(
                "Error selecting or joining a voice channel:",
                error
            );
        }
    }

    async playAudioStream(userId: UUID, audioStream: Readable) {
        const connection = this.connections.get(userId);
        if (connection == null) {
            elizaLogger.log(`No connection for user ${userId}`);
            return;
        }
        this.cleanupAudioPlayer(this.activeAudioPlayer);
        const audioPlayer = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            },
        });
        this.activeAudioPlayer = audioPlayer;
        connection.subscribe(audioPlayer);

        const audioStartTime = Date.now();

        const resource = createAudioResource(audioStream, {
            inputType: StreamType.Arbitrary,
        });
        audioPlayer.play(resource);

        // Return a promise that resolves when the audio finishes playing
        return new Promise((resolve, reject) => {
            audioPlayer.on("error", (err: any) => {
                elizaLogger.log(`Audio player error: ${err}`);
                reject(err);
            });

            audioPlayer.on(
                "stateChange",
                (_oldState: any, newState: { status: string }) => {
                    if (newState.status === "idle") {
                        const idleTime = Date.now();
                        elizaLogger.log(
                            `Audio playback took: ${idleTime - audioStartTime}ms`
                        );
                        resolve(undefined);
                    }
                }
            );
        });
    }

    cleanupAudioPlayer(audioPlayer: AudioPlayer) {
        if (!audioPlayer) return;

        audioPlayer.stop();
        audioPlayer.removeAllListeners();
        if (audioPlayer === this.activeAudioPlayer) {
            this.activeAudioPlayer = null;
        }
    }

    async handleJoinChannelCommand(interaction: any) {
        try {
            // Defer the reply immediately to prevent interaction timeout
            await interaction.deferReply();

            const channelId = interaction.options.get("channel")
                ?.value as string;
            if (!channelId) {
                await interaction.editReply(
                    "Please provide a voice channel to join."
                );
                return;
            }

            const guild = interaction.guild;
            if (!guild) {
                await interaction.editReply("Could not find guild.");
                return;
            }

            const voiceChannel = interaction.guild.channels.cache.find(
                (channel: VoiceChannel) =>
                    channel.id === channelId &&
                    channel.type === ChannelType.GuildVoice
            );

            if (!voiceChannel) {
                await interaction.editReply("Voice channel not found!");
                return;
            }

            await this.joinChannel(voiceChannel as BaseGuildVoiceChannel);
            await interaction.editReply(
                `Joined voice channel: ${voiceChannel.name}`
            );
        } catch (error) {
            elizaLogger.error("Error joining voice channel:", error);
            // Use editReply instead of reply for the error case
            await interaction
                .editReply("Failed to join the voice channel.")
                .catch(elizaLogger.error);
        }
    }

    async handleLeaveChannelCommand(interaction: any) {
        const connection = this.getVoiceConnection(interaction.guildId as any);

        if (!connection) {
            await interaction.reply("Not currently in a voice channel.");
            return;
        }

        try {
            connection.destroy();
            await interaction.reply("Left the voice channel.");
        } catch (error) {
            elizaLogger.error("Error leaving voice channel:", error);
            await interaction.reply("Failed to leave the voice channel.");
        }
    }
}
