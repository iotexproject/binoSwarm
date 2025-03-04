import {
    State,
    IAgentRuntime,
    composeContext,
    generateText,
    ModelClass,
    elizaLogger,
} from "@elizaos/core";
import axios from "axios";

import { quicksilverResponseTemplate } from "../template";
import { parseTagContent } from "../helpers/parsers";

type QuicksilverTool =
    | "weather-current"
    | "weather-forecast"
    | "news"
    | "depin-metrics"
    | "depin-projects"
    | "l1data"
    | "nuclear"
    | "mapbox";

type NewsToolParams = {
    category:
        | "business"
        | "entertainment"
        | "general"
        | "health"
        | "science"
        | "sports"
        | "technology";
    q: string;
};

type ToolParams = {
    "weather-current": { lat: number; lon: number };
    "weather-forecast": { lat: number; lon: number };
    news: NewsToolParams;
    "depin-metrics": { isLatest?: boolean };
    "depin-projects": Record<string, never>;
    l1data: Record<string, never>;
    nuclear: { start: string; end: string }; // Format: YYYY-MM-DD
    mapbox: { location: string };
};

export async function askQuickSilver(content: string): Promise<string> {
    const url = process.env.QUICKSILVER_URL || "https://quicksilver.iotex.ai";
    const response = await axios.post(url + "/ask", {
        q: content,
    });

    if (response.data.data) {
        return response.data.data;
    } else {
        throw new Error("Failed to fetch weather data");
    }
}

export async function getRawDataFromQuicksilver<T extends QuicksilverTool>(
    tool: T,
    params?: ToolParams[T]
): Promise<any> {
    const url = process.env.QUICKSILVER_URL || "https://quicksilver.iotex.ai";
    const queryParams = new URLSearchParams({ tool });

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            queryParams.append(key, String(value));
        });
    }

    const response = await axios.get(`${url}/raw?${queryParams.toString()}`);

    if (response.data?.data) {
        return response.data.data;
    } else {
        throw new Error(`Failed to fetch raw data for tool: ${tool}`);
    }
}

export async function adaptQSResponse(
    state: State,
    runtime: IAgentRuntime,
    qsResponse: string
) {
    state.qsResponse = qsResponse;
    const context = composeContext({
        state: {
            ...state,
            recentMessages: state.recentMessages
                .split("\n")
                .slice(-10)
                .join("\n"),
        },
        template:
            // @ts-expect-error: quicksilverResponseTemplate should be added to character type
            runtime.character.templates?.quicksilverResponseTemplate ||
            quicksilverResponseTemplate,
    });
    elizaLogger.info(context);
    const response = await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE,
    });

    elizaLogger.info(response);

    return parseTagContent(response, "response");
}
