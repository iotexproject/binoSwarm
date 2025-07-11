import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { z } from "zod";
import { tavily } from "@tavily/core";

import { elizaLogger } from "./index.ts";
import {
    Content,
    IAgentRuntime,
    ModelClass,
    SearchResponse,
    ActionResponse,
} from "./types.ts";
import {
    generateObject,
    generateObjectFromMessages,
} from "./textGeneration.ts";
import { CoreUserMessage } from "ai";

const UTILITY_SYSTEM_PROMPT =
    "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.";

export async function generateShouldRespond({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<"RESPOND" | "IGNORE" | "STOP"> {
    const shouldRespondSchema = z.object({
        analysis: z.string().describe("A detailed analysis of your response"),
        response: z.enum(["RESPOND", "IGNORE", "STOP"]),
    });

    try {
        const response = await generateObject<{
            response: "RESPOND" | "IGNORE" | "STOP";
        }>({
            runtime,
            context,
            modelClass,
            schema: shouldRespondSchema,
            schemaName: "ShouldRespond",
            schemaDescription: "A boolean value",
            customSystemPrompt: UTILITY_SYSTEM_PROMPT,
            functionId: "generateShouldRespond",
        });

        return response.object.response;
    } catch (error) {
        elizaLogger.error("Error in generateShouldRespond:", error);
        return "IGNORE";
    }
}

export async function splitChunks(
    content: string,
    chunkSize: number = 512,
    bleed: number = 20
): Promise<string[]> {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: Number(chunkSize),
        chunkOverlap: Number(bleed),
    });

    return textSplitter.splitText(content);
}

export async function generateTrueOrFalse({
    runtime,
    context = "",
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<boolean> {
    const booleanSchema = z.object({
        analysis: z.string().describe("A detailed analysis of your response"),
        response: z.boolean(),
    });

    try {
        const response = await generateObject<{ response: boolean }>({
            runtime,
            context,
            modelClass,
            schema: booleanSchema,
            schemaName: "Boolean",
            schemaDescription: "A boolean value",
            customSystemPrompt: UTILITY_SYSTEM_PROMPT,
            functionId: "generateTrueOrFalse",
        });

        return response.object.response;
    } catch (error) {
        elizaLogger.error("Error in generateTrueOrFalse:", error);
    }
}

export async function generateMessageResponse({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<Content> {
    const contentSchema = z.object({
        responseAnalysis: z
            .string()
            .describe(
                "Any type of analysis and resoning for response generation comes here."
            ),
        text: z
            .string()
            .describe(
                "Cleaned up response for the user. It should not include any analysis, reasoning or action names, it will be directly sent to the user."
            ),
        user: z.string().describe("Your name as a character."),
        action: z.string().describe("The action to take."),
    });

    try {
        const result = await generateObject<Content>({
            runtime,
            context,
            modelClass,
            schema: contentSchema,
            schemaName: "Content",
            schemaDescription: "Message content structure",
            functionId: "generateMessageResponse",
        });
        return result.object;
    } catch (error) {
        elizaLogger.error("Error in generateMessageResponse:", error);
        throw error;
    }
}

export const generateCaption = async (
    data: { imageUrl: string },
    runtime: IAgentRuntime
): Promise<{
    title: string;
    description: string;
}> => {
    const { imageUrl } = data;
    const messages: CoreUserMessage[] = [
        {
            role: "user",
            content: [
                {
                    type: "image",
                    image: imageUrl,
                },
            ],
        },
    ];

    const descriptionSchema = z.object({
        title: z.string().describe("The title of the image"),
        description: z.string().describe("The description of the image"),
    });

    const result = await generateObjectFromMessages<{
        title: string;
        description: string;
    }>({
        runtime,
        context: "",
        modelClass: ModelClass.SMALL,
        schema: descriptionSchema,
        messages,
        schemaName: "ImageDescription",
        schemaDescription: "The description of the image",
        functionId: "generateCaption",
    });

    return result.object;
};

export const generateWebSearch = async (
    query: string,
    runtime: IAgentRuntime
): Promise<SearchResponse> => {
    try {
        const apiKey = runtime.getSetting("TAVILY_API_KEY") as string;
        if (!apiKey) {
            throw new Error("TAVILY_API_KEY is not set");
        }
        const tvly = tavily({ apiKey });
        const response = await tvly.search(query, {
            includeAnswer: true,
            maxResults: 3, // 5 (default)
            topic: "general", // "general"(default) "news"
            searchDepth: "basic", // "basic"(default) "advanced"
            includeImages: false, // false (default) true
        });
        return response;
    } catch (error) {
        elizaLogger.error("Error:", error);
    }
};

export async function generateTweetActions({
    runtime,
    context,
    modelClass,
}: {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
}): Promise<ActionResponse> {
    const actionsSchema = z.object({
        analysis: z.string().describe("A detailed analysis of the tweet"),
        like: z.boolean().describe("Whether to like the tweet"),
        retweet: z.boolean().describe("Whether to retweet the tweet"),
        quote: z.boolean().describe("Whether to quote the tweet"),
        reply: z.boolean().describe("Whether to reply to the tweet"),
    });

    try {
        const response = await generateObject<ActionResponse>({
            runtime,
            context,
            modelClass,
            schema: actionsSchema,
            schemaName: "Actions",
            schemaDescription: "The actions to take on the tweet",
            customSystemPrompt: UTILITY_SYSTEM_PROMPT,
            functionId: "generateTweetActions",
        });

        return response.object;
    } catch (error) {
        elizaLogger.error("Error in generateTweetActions:", error);
        return {
            like: false,
            retweet: false,
            quote: false,
            reply: false,
        };
    }
}
