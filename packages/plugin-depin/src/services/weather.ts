import { IAgentRuntime } from "@elizaos/core";
import axios from "axios";

import {
    WeatherData,
    WeatherForecast,
    WeatherForecastDP,
} from "../types/depin";

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

export async function getWeatherForecast(
    runtime: IAgentRuntime,
    coordinates: { lat: number; lon: number }
): Promise<WeatherForecast> {
    const apiKey = runtime.getSetting("NUBILA_API_KEY");
    const apiUrl = `${NUBILA_API_URL}forecast?lat=${coordinates.lat}&lon=${coordinates.lon}`;
    const response = await axios.get(apiUrl, {
        headers: { "x-api-key": apiKey },
    });
    if (response.data.ok) {
        const forecast = response.data.data.map((item: WeatherForecastDP) => ({
            ...item,
            parsed_timestamp: new Date(item.timestamp * 1000).toISOString(),
        }));
        return forecast;
    } else {
        throw new Error("Failed to fetch weather forecast data");
    }
}
