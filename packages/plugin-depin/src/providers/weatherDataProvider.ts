import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";

import { askQuickSilver } from "../services/quicksilver";

export const weatherDataProvider: Provider = {
    async get(
        _runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> {
        const randomCity =
            usCities[Math.floor(Math.random() * usCities.length)];
        const weather = await askQuickSilver(
            `What is the current weather in ${randomCity}?`
        );
        return `
            #### **Current Weather for ${randomCity}**
            ${weather}
        `;
    },
};

const usCities = [
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
];
