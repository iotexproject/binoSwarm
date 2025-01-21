import { IAgentRuntime } from "@elizaos/core";
import axios from "axios";

const MAPBOX_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/";

export async function getLatLngMapbox(runtime: IAgentRuntime, loc: string) {
    const apiKey = runtime.getSetting("MAPBOX_API_KEY");
    const apiUrl = `${MAPBOX_URL}${encodeURIComponent(loc)}.json?access_token=${apiKey}`;
    try {
        const response = await axios.get(apiUrl);
        if (!response.data.features?.length) {
            return null; // Location not found
        }
        const [lng, lat] = response.data.features[0].center;
        return { lat, lon: lng };
    } catch (error) {
        console.error(
            "Error fetching coordinates:",
            error instanceof Error ? error.message : "Unknown error"
        );
        return null;
    }
}
