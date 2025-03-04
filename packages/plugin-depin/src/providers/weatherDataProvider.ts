import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    ICacheManager,
} from "@elizaos/core";

import { getRawDataFromQuicksilver } from "../services/quicksilver";
import { WeatherData } from "../types/depin";

class WeatherDataProvider {
    private cacheManager: ICacheManager;
    private readonly COORDINATES_CACHE_KEY = "weather/coordinates";
    private readonly WEATHER_CACHE_KEY = "weather/current";
    private readonly WEATHER_CACHE_TTL = 60 * 60; // 1 hour in seconds

    constructor(runtime: IAgentRuntime) {
        this.cacheManager = runtime.cacheManager;
    }

    async getRandomCityWeather(
        runtime: IAgentRuntime
    ): Promise<WeatherData | null> {
        try {
            const citiesArray = this.getCitiesArray(runtime);
            const randomCity = this.pickRandomCity(citiesArray);
            const coordinates = await this.getCoordinates(randomCity);
            const weather = await this.getWeatherData(coordinates, randomCity);

            return weather;
        } catch (error) {
            throw error;
        }
    }

    pickRandomCity(citiesArray: string[]) {
        return citiesArray[Math.floor(Math.random() * citiesArray.length)];
    }

    getCitiesArray(runtime: IAgentRuntime) {
        const cities = runtime.getSetting("WEATHER_CITIES") || "";
        if (!cities) {
            throw new Error("WEATHER_CITIES is not set");
        }
        return cities.split(",");
    }

    private async readFromCache<T>(key: string): Promise<T | null> {
        try {
            return await this.cacheManager.get<T>(key);
        } catch (error) {
            elizaLogger.error(
                `Error reading from cache for key ${key}:`,
                error
            );
            return null;
        }
    }

    private async writeToCache<T>(
        key: string,
        data: T,
        ttl?: number
    ): Promise<void> {
        try {
            const options = ttl
                ? { expires: Date.now() + ttl * 1000 }
                : undefined;
            await this.cacheManager.set(key, data, options);
        } catch (error) {
            elizaLogger.error(`Error writing to cache for key ${key}:`, error);
        }
    }

    async getCoordinates(city: string): Promise<{ lat: number; lon: number }> {
        const cacheKey = `${this.COORDINATES_CACHE_KEY}/${city}`;

        const cachedCoordinates = await this.readFromCache<any>(cacheKey);
        if (cachedCoordinates) {
            elizaLogger.info(`Using cached coordinates for ${city}`);
            const [lon, lat] =
                cachedCoordinates.features[0].geometry.coordinates;
            return { lat, lon };
        }

        elizaLogger.info(`Fetching coordinates for ${city}`);
        const coordinates = await getRawDataFromQuicksilver("mapbox", {
            location: city,
        });

        // Cache the coordinates permanently (no TTL)
        await this.writeToCache(cacheKey, coordinates);

        const [lon, lat] = coordinates.features[0].geometry.coordinates;

        return { lat, lon };
    }

    async getWeatherData(
        coordinates: { lat: number; lon: number },
        city: string
    ): Promise<WeatherData> {
        const cacheKey = `${this.WEATHER_CACHE_KEY}/${city}`;

        const cachedWeather = await this.readFromCache<WeatherData>(cacheKey);
        if (cachedWeather) {
            elizaLogger.info(`Using cached weather data for ${city}`);
            return cachedWeather;
        }

        elizaLogger.info(`Fetching weather data for ${city}`);
        const weather = await getRawDataFromQuicksilver("weather-current", {
            lat: coordinates.lat,
            lon: coordinates.lon,
        });

        await this.writeToCache(cacheKey, weather, this.WEATHER_CACHE_TTL);

        return weather;
    }

    static formatWeatherData(weather: WeatherData) {
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
    }
}

export const weatherDataProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> {
        try {
            const weatherDataProvider = new WeatherDataProvider(runtime);
            const weather =
                await weatherDataProvider.getRandomCityWeather(runtime);
            return WeatherDataProvider.formatWeatherData(weather);
        } catch (error) {
            elizaLogger.error("Error fetching weather data:", error.message);
            return "";
        }
    },
};
