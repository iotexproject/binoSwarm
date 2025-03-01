import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";

import { getLatLngMapbox } from "../services/map";
import { getRawDataFromQuicksilver } from "../services/quicksilver";
import { WeatherForecast } from "../types/depin";

export const weatherForecastProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> {
        try {
            const randomCity =
                cities[Math.floor(Math.random() * cities.length)];
            const coordinates = await getLatLngMapbox(runtime, randomCity);

            // Get weather forecast from Quicksilver using coordinates
            const forecast = await getRawDataFromQuicksilver(
                "weather-forecast",
                {
                    lat: coordinates.lat,
                    lon: coordinates.lon,
                }
            );

            return formatWeatherData(forecast);
        } catch (error) {
            elizaLogger.error(
                "Error fetching weather forecast:",
                error.message
            );
            return null;
        }
    },
};

const formatWeatherData = (forecast: WeatherForecast) => {
    return `
        #### **Weather Forecast for ${forecast[0].location_name}**
        location_name, date, temperature, condition, condition_desc, condition_code, temperature_min, temperature_max, feels_like, pressure, humidity, wind_speed, wind_direction, uv, luminance, sea_level, rain, wet_bulb
        ${forecast
            .map(
                (dp) => `
            ${dp.location_name}, ${dp.parsed_timestamp}, ${dp.temperature}°C, ${dp.condition}, ${dp.condition_desc}, ${dp.condition_code}, ${dp.temperature_min}°C, ${dp.temperature_max}°C, ${dp.feels_like}°C, ${dp.pressure}, ${dp.humidity}, ${dp.wind_speed}, ${dp.wind_direction}, ${dp.uv}, ${dp.luminance}, ${dp.sea_level}, ${dp.rain}, ${dp.wet_bulb}
        `
            )
            .join("\n")}
    `;
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
