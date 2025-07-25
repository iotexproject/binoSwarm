import {
    IAgentRuntime,
    ModelClass,
    elizaLogger,
    trimTokens,
    generateObject,
    splitMessage,
} from "@elizaos/core";
import {
    ChannelType,
    Message as DiscordMessage,
    PermissionsBitField,
    TextChannel,
    ThreadChannel,
} from "discord.js";
import { z } from "zod";

export function getWavHeader(
    audioLength: number,
    sampleRate: number,
    channelCount: number = 1,
    bitsPerSample: number = 16
): Buffer {
    const wavHeader = Buffer.alloc(44);
    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(36 + audioLength, 4); // Length of entire file in bytes minus 8
    wavHeader.write("WAVE", 8);
    wavHeader.write("fmt ", 12);
    wavHeader.writeUInt32LE(16, 16); // Length of format data
    wavHeader.writeUInt16LE(1, 20); // Type of format (1 is PCM)
    wavHeader.writeUInt16LE(channelCount, 22); // Number of channels
    wavHeader.writeUInt32LE(sampleRate, 24); // Sample rate
    wavHeader.writeUInt32LE(
        (sampleRate * bitsPerSample * channelCount) / 8,
        28
    ); // Byte rate
    wavHeader.writeUInt16LE((bitsPerSample * channelCount) / 8, 32); // Block align ((BitsPerSample * Channels) / 8)
    wavHeader.writeUInt16LE(bitsPerSample, 34); // Bits per sample
    wavHeader.write("data", 36); // Data chunk header
    wavHeader.writeUInt32LE(audioLength, 40); // Data chunk size
    return wavHeader;
}

const MAX_MESSAGE_LENGTH = 1900;

export async function generateSummary(
    runtime: IAgentRuntime,
    text: string
): Promise<{ title: string; description: string }> {
    // make sure text is under 128k characters
    text = await trimTokens(text, 100000, runtime);

    const prompt = `Please generate a concise summary for the following text:

  Text: """
  ${text}
  """
  `;

    const summarySchema = z.object({
        title: z.string().describe("Generated Title"),
        summary: z
            .string()
            .describe("Generated summary and/or description of the text"),
    });

    type Summary = z.infer<typeof summarySchema>;

    const response = await generateObject<Summary>({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
        schema: summarySchema,
        schemaName: "summary",
        schemaDescription: "A summary of the text",
        functionId: "discord_generateSummary",
        tags: ["discord", "discord-generate-summary"],
    });

    const parsedResponse = summarySchema.parse(response.object);

    if (parsedResponse) {
        return {
            title: parsedResponse.title,
            description: parsedResponse.summary,
        };
    }

    return {
        title: "",
        description: "",
    };
}

export async function sendMessageInChunks(
    channel: TextChannel,
    content: string,
    inReplyTo: string,
    files: any[]
): Promise<DiscordMessage[]> {
    const sentMessages: DiscordMessage[] = [];
    const messages = splitMessage(content, MAX_MESSAGE_LENGTH);
    try {
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (
                message.trim().length > 0 ||
                (i === messages.length - 1 && files && files.length > 0)
            ) {
                const options: any = {
                    content: message.trim(),
                };

                // if (i === 0 && inReplyTo) {
                //   // Reply to the specified message for the first chunk
                //   options.reply = {
                //     messageReference: inReplyTo,
                //   };
                // }

                if (i === messages.length - 1 && files && files.length > 0) {
                    // Attach files to the last message chunk
                    options.files = files;
                }

                const m = await channel.send(options);
                sentMessages.push(m);
            }
        }
    } catch (error) {
        elizaLogger.error("Error sending message:", error);
    }

    return sentMessages;
}



export function canSendMessage(channel) {
    // validate input
    if (!channel) {
        return {
            canSend: false,
            reason: "No channel given",
        };
    }
    // if it is a DM channel, we can always send messages
    if (channel.type === ChannelType.DM) {
        return {
            canSend: true,
            reason: null,
        };
    }
    const botMember = channel.guild?.members.cache.get(channel.client.user.id);

    if (!botMember) {
        return {
            canSend: false,
            reason: "Not a guild channel or bot member not found",
        };
    }

    // Required permissions for sending messages
    const requiredPermissions = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
    ];

    // Add thread-specific permission if it's a thread
    if (channel instanceof ThreadChannel) {
        requiredPermissions.push(
            PermissionsBitField.Flags.SendMessagesInThreads
        );
    }

    // Check permissions
    const permissions = channel.permissionsFor(botMember);

    if (!permissions) {
        return {
            canSend: false,
            reason: "Could not retrieve permissions",
        };
    }

    // Check each required permission
    const missingPermissions = requiredPermissions.filter(
        (perm) => !permissions.has(perm)
    );

    return {
        canSend: missingPermissions.length === 0,
        missingPermissions: missingPermissions,
        reason:
            missingPermissions.length > 0
                ? `Missing permissions: ${missingPermissions.map((p) => String(p)).join(", ")}`
                : null,
    };
}
