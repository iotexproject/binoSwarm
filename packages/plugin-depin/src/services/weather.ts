import { IAgentRuntime } from "@elizaos/core";
import axios from "axios";

import { WeatherData } from "../types/depin";

const NUBILA_API_URL = "https://api.nubila.ai/api/v1/";

export async function getWeather(
    runtime: IAgentRuntime,
    coordinates: { lat: number; lon: number }
): Promise<WeatherData> {
    const apiKey = runtime.getSetting("NUBILA_API_KEY");
    const apiUrl = `${NUBILA_API_URL}weather?lat=${coordinates.lat}&lon=${coordinates.lon}`;
    const response = await axios.get(apiUrl, {
        headers: { "x-api-key": apiKey },
    });
    if (response.data.ok) {
        return {
            ...response.data.data,
            parsed_timestamp: new Date(
                response.data.data.timestamp * 1000
            ).toISOString(),
        };
    } else {
        throw new Error("Failed to fetch weather data");
    }
}
