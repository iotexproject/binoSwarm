import {
    Provider,
    IAgentRuntime,
    Memory,
    State,
    elizaLogger,
    ICacheManager,
} from "@elizaos/core";

import { getRawDataFromQuicksilver } from "../services/quicksilver";
import { WeatherForecast } from "../types/depin";

class WeatherForecastProvider {
    private cacheManager: ICacheManager;
    private readonly COORDINATES_CACHE_KEY = "weather/coordinates";
    private readonly FORECAST_CACHE_KEY = "weather/forecast";
    private readonly FORECAST_CACHE_TTL = 60 * 60; // 1 hour in seconds

    constructor(runtime: IAgentRuntime) {
        this.cacheManager = runtime.cacheManager;
    }

    async getRandomCityWeather(
        runtime: IAgentRuntime
    ): Promise<WeatherForecast | null> {
        try {
            const citiesArray = this.getCitiesArray(runtime);
            const randomCity = this.pickRandomCity(citiesArray);
            const coordinates = await this.getCoordinates(randomCity);
            const forecast = await this.getWeatherData(coordinates, randomCity);

            return forecast;
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
            const data = await this.cacheManager.get<T>(key);
            return data || null;
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

        await this.writeToCache(cacheKey, coordinates);

        const [lon, lat] = coordinates.features[0].geometry.coordinates;

        return { lat, lon };
    }

    async getWeatherData(
        coordinates: { lat: number; lon: number },
        city: string
    ): Promise<WeatherForecast> {
        const cacheKey = `${this.FORECAST_CACHE_KEY}/${city}`;

        const cachedForecast =
            await this.readFromCache<WeatherForecast>(cacheKey);
        if (cachedForecast) {
            elizaLogger.info(`Using cached forecast data for ${city}`);
            return cachedForecast;
        }

        elizaLogger.info(`Fetching forecast data for ${city}`);
        const forecast = await getRawDataFromQuicksilver("weather-forecast", {
            lat: coordinates.lat,
            lon: coordinates.lon,
        });

        await this.writeToCache(cacheKey, forecast, this.FORECAST_CACHE_TTL);

        return forecast;
    }

    static formatWeatherData(forecast: WeatherForecast) {
        if (!forecast || forecast.length === 0) {
            return "No forecast data available.";
        }

        let result = `
            #### **Weather Forecast for ${forecast[0].location_name}**
        `;

        forecast.forEach((day) => {
            result += `
            #### Date: ${day.parsed_timestamp}
            Temperature: ${day.temperature}°C
            Condition: ${day.condition}
            Condition Description: ${day.condition_desc}
            Condition Code: ${day.condition_code}
            Temperature Min: ${day.temperature_min}°C
            Temperature Max: ${day.temperature_max}°C
            Feels Like: ${day.feels_like}°C
            Pressure: ${day.pressure} hPa
            Humidity: ${day.humidity}%
            Wind Speed: ${day.wind_speed} km/h
            Wind Direction: ${day.wind_direction}°
            UV Index: ${day.uv}
            Luminance: ${day.luminance} lx
            Sea Level: ${day.sea_level} m
            Rain: ${day.rain} mm
            Wet Bulb: ${day.wet_bulb}°C
            `;
        });

        return result;
    }

    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> {
        try {
            const forecast = await this.getRandomCityWeather(runtime);
            return WeatherForecastProvider.formatWeatherData(forecast);
        } catch (error) {
            elizaLogger.error(
                "Error fetching weather forecast:",
                error.message
            );
            return "";
        }
    }
}

export const weatherForecastProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string> {
        try {
            const provider = new WeatherForecastProvider(runtime);
            return await provider.get(runtime, message, state);
        } catch (error) {
            elizaLogger.error(
                "Error fetching weather forecast:",
                error.message
            );
            return "";
        }
    },
};
