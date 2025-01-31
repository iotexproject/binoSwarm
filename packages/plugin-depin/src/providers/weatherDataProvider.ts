import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";

import { getLatLngMapbox } from "../services/map";
import { getWeather } from "../services/weather";

export const weatherDataProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> {
        const randomCity =
            cities[Math.floor(Math.random() * cities.length)];
        const coordinates = await getLatLngMapbox(runtime, randomCity);
        const weather = await getWeather(runtime, coordinates);

        return `
            #### **Current Weather for ${randomCity}**
            ${JSON.stringify(weather)}
        `;
    },
};

const cities = [
    "New York",
    "Los Angeles",
    "Chicago",
    "Houston",
    "Phoenix",
    "Philadelphia",
    "San Antonio",
    "San Diego",
    "Dallas",
    "San Jose",
    "Austin",
    "Jacksonville",
    "Fort Worth",
    "Columbus",
    "Charlotte",
    "San Francisco",
    "Indianapolis",
    "Seattle",
    "Denver",
    "Washington",
    "Boston",
    "El Paso",
    "Nashville",
    "Detroit",
    "Oklahoma City",
    "Portland",
    "Las Vegas",
    "Memphis",
    "Louisville",
    "Baltimore",
    "Milwaukee",
    "Albuquerque",
    "Tucson",
    "Fresno",
    "Sacramento",
    "Mesa",
    "Kansas City",
    "Atlanta",
    "Omaha",
    "Colorado Springs",
    "Raleigh",
    "Miami",
    "Long Beach",
    "Virginia Beach",
    "Oakland",
    "Minneapolis",
    "Tulsa",
    "Tampa",
    "Arlington",
    "Tokyo",
    "Hong Kong",
    "Seoul",
    "Taipei",
    "Singapore",
    "Bangkok",
    "Mumbai",
    "New Delhi",
    "Dubai",
    "Istanbul",
    "Tel Aviv",
    "London",
    "Paris",
    "Amsterdam",
    "Brussels",
    "Frankfurt",
    "Zurich",
    "Rome",
    "Milan",
    "Madrid",
    "Stockholm",
    "Copenhagen",
    "Sydney",
];
