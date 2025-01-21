import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    ModelClass,
    composeContext,
    generateText,
    elizaLogger,
} from "@elizaos/core";
import { weatherForecastTemplate } from "../template";

import { getWeatherForecast } from "../services/weather";
import { extractLocationAndCoordinates } from "../helpers/extractors";
import { parseTagContent } from "../helpers/parsers";

export const weatherForecast: Action = {
    name: "WEATHER_FORECAST",
    similes: [
        "FORECAST",
        "FUTURE_WEATHER",
        "UPCOMING_WEATHER",
        "WEATHER_PREDICTION",
    ],
    description: "Get the weather forecast for a given location",
    validate: async (runtime: IAgentRuntime) => {
        const nubilaKey = runtime.getSetting("NUBILA_API_KEY");
        const mapboxKey = runtime.getSetting("MAPBOX_API_KEY");
        if (!nubilaKey || !mapboxKey) {
            return false;
        }
        return true;
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "What's the weather forecast for Tokyo?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Here's the weather forecast for Tokyo: Tomorrow will be 22°C with partly cloudy skies. The next few days will see temperatures ranging from 18-24°C with a chance of rain on Thursday.",
                    action: "WEATHER_FORECAST",
                },
            },
        ],
        [
            {
                user: "user",
                content: {
                    text: "Will it rain in London this week?",
                },
            },
            {
                user: "assistant",
                content: {
                    text: "Looking at London's forecast: There's a 60% chance of rain on Wednesday with temperatures around 15°C. The rest of the week should be mostly cloudy with occasional showers.",
                    action: "WEATHER_FORECAST",
                },
            },
        ],
    ],
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }
        try {
            const coordinates = await extractLocationAndCoordinates(
                state,
                runtime
            );
            const forecastAnalysis = await getAndAnalyzeForecast(
                state,
                runtime,
                coordinates
            );
            if (callback) {
                callback({
                    text: forecastAnalysis,
                    inReplyTo: message.id,
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error in current weather plugin:", error);
            if (callback) {
                callback({
                    text: `Error processing request, try again`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
};

async function getAndAnalyzeForecast(
    state: State,
    runtime: IAgentRuntime,
    coordinates: { lat: number; lon: number }
) {
    elizaLogger.log("Looking up the weather for coordinates: ", coordinates);
    const weather = await getWeatherForecast(runtime, coordinates);
    state.weatherForecast = JSON.stringify(weather);
    const weatherContext = composeContext({
        state,
        template:
            // @ts-ignore
            runtime.character.templates?.weatherForecastTemplate ||
            weatherForecastTemplate,
    });
    const weatherText = await generateText({
        runtime,
        context: weatherContext,
        modelClass: ModelClass.LARGE,
    });
    return parseTagContent(weatherText, "weather_forecast_analysis");
}
