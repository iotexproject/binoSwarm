import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
} from "@elizaos/core";

import { getLatLngMapbox } from "../services/map";
import { getRawDataFromQuicksilver } from "../services/quicksilver";
import { WeatherData } from "../types/depin";

export const weatherDataProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> {
        try {
            const randomCity =
                cities[Math.floor(Math.random() * cities.length)];
            const coordinates = await getLatLngMapbox(runtime, randomCity);

            // Get weather data from Quicksilver using coordinates
            const weather = await getRawDataFromQuicksilver("weather-current", {
                lat: coordinates.lat,
                lon: coordinates.lon,
            });

            return formatWeatherData(weather);
        } catch (error) {
            elizaLogger.error("Error fetching weather data:", error.message);
            return null;
        }
    },
};

const formatWeatherData = (weather: WeatherData) => {
    return `
        #### **Current Weather for ${weather.location_name}**
        Temperature: ${weather.temperature}°C
        Condition: ${weather.condition}
        Condition Description: ${weather.condition_desc}
        Condition Code: ${weather.condition_code}
        Temperature Min: ${weather.temperature_min}°C
        Temperature Max: ${weather.temperature_max}°C
        Feels Like: ${weather.feels_like}°C
        Pressure: ${weather.pressure} hPa
        Humidity: ${weather.humidity}%
        Wind Speed: ${weather.wind_speed} km/h
        Wind Direction: ${weather.wind_direction}°
        UV Index: ${weather.uv}
        Luminance: ${weather.luminance} lx
        Elevation: ${weather.elevation} m
        Rain: ${weather.rain} mm
        Wet Bulb: ${weather.wet_bulb}°C
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
