import { IAgentRuntime } from "@elizaos/core";
import axios from "axios";

export async function getWeather(runtime: IAgentRuntime, coordinates: { lat: number, lon: number }) {
    const apiKey = runtime.getSetting("NUBILA_API_KEY");
    const apiUrl = `https://api.nubila.ai/api/v1/weather?lat=${coordinates.lat}&lon=${coordinates.lon}`;
    const response = await axios.get(apiUrl, {
        headers: { "x-api-key": apiKey }
    });
    if (response.data.ok) {
        return response.data;
    } else {
        throw new Error("Failed to fetch weather data");
    }
}

export async function getLatLngMapbox(runtime: IAgentRuntime, location: string) {
    const apiKey = runtime.getSetting("MAPBOX_API_KEY");
    const apiUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(location)}.json?access_token=${apiKey}`;

    try {
        const response = await axios.get(apiUrl);
        if (!response.data.features?.length) {
            return null; // Location not found
        }
        const [lng, lat] = response.data.features[0].center;
        return { lat, lon: lng };
    } catch (error) {
        console.error('Error fetching coordinates:', error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}
