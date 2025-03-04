import { describe, expect, it, vi, beforeEach } from "vitest";
import { weatherDataProvider } from "../providers/weatherDataProvider";
import { elizaLogger } from "@elizaos/core";

vi.mock("@elizaos/core", async () => {
    const actual = await vi.importActual("@elizaos/core");
    return {
        ...actual,
        elizaLogger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

vi.mock("../services/quicksilver", () => ({
    getRawDataFromQuicksilver: vi
        .fn()
        .mockImplementation((endpoint, params) => {
            if (endpoint === "mapbox") {
                return Promise.resolve({
                    features: [
                        {
                            geometry: { coordinates: [-74.006, 40.7128] },
                        },
                    ],
                });
            } else if (endpoint === "weather-current") {
                return Promise.resolve({
                    location_name: "New York",
                    temperature: 22.5,
                    condition: "Clear",
                    condition_desc: "Clear sky",
                    condition_code: 800,
                    temperature_min: 20.1,
                    temperature_max: 24.3,
                    feels_like: 23.0,
                    pressure: 1013,
                    humidity: 65,
                    wind_speed: 5.2,
                    wind_direction: 180,
                    uv: 4,
                    luminance: 10000,
                });
            }
            return Promise.reject(new Error("Unknown endpoint"));
        }),
}));

import { getRawDataFromQuicksilver } from "../services/quicksilver";

describe("WeatherDataProvider", () => {
    let mockRuntime: any;
    let mockMessage: any;
    let mockState: any;
    let mockCacheManager: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCacheManager = {
            get: vi.fn().mockResolvedValue(undefined),
            set: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
        };

        mockRuntime = {
            getSetting: vi.fn().mockReturnValue("New York,London,Tokyo"),
            cacheManager: mockCacheManager,
        };
        mockMessage = { content: { text: "test message" } };
        mockState = {};
    });

    describe("get", () => {
        it("should fetch and format weather data when not cached", async () => {
            mockCacheManager.get.mockResolvedValue(undefined);

            const result = await weatherDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/coordinates")
            );
            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/current")
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "mapbox",
                expect.any(Object)
            );
            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "weather-current",
                {
                    lat: 40.7128,
                    lon: -74.006,
                }
            );

            expect(mockCacheManager.set).toHaveBeenCalledTimes(2);

            expect(result).toContain("Current Weather for New York");
            expect(result).toContain("Temperature: 22.5°C");
        });

        it("should use cached coordinates when available", async () => {
            mockCacheManager.get.mockImplementation((key) => {
                if (key.includes("weather/coordinates")) {
                    return Promise.resolve({
                        features: [
                            {
                                geometry: { coordinates: [-74.006, 40.7128] },
                            },
                        ],
                    });
                }
                return Promise.resolve(undefined);
            });

            const result = await weatherDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/coordinates")
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "weather-current",
                {
                    lat: 40.7128,
                    lon: -74.006,
                }
            );
            expect(getRawDataFromQuicksilver).not.toHaveBeenCalledWith(
                "mapbox",
                expect.any(Object)
            );

            expect(mockCacheManager.set).toHaveBeenCalledTimes(1);
            expect(mockCacheManager.set).toHaveBeenCalledWith(
                expect.stringContaining("weather/current"),
                expect.any(Object),
                expect.any(Object)
            );

            expect(result).toContain("Current Weather for New York");
        });

        it("should use cached weather data when available", async () => {
            const cachedWeatherData = {
                location_name: "New York",
                temperature: 22.5,
                condition: "Clear",
                condition_desc: "Clear sky",
                condition_code: 800,
                temperature_min: 20.1,
                temperature_max: 24.3,
                feels_like: 23.0,
                pressure: 1013,
                humidity: 65,
                wind_speed: 5.2,
                wind_direction: 180,
                uv: 4,
                luminance: 10000,
            };

            mockCacheManager.get.mockImplementation((key) => {
                if (key.includes("weather/coordinates")) {
                    return Promise.resolve({
                        features: [
                            {
                                geometry: { coordinates: [-74.006, 40.7128] },
                            },
                        ],
                    });
                } else if (key.includes("weather/current")) {
                    return Promise.resolve(cachedWeatherData);
                }
                return Promise.resolve(undefined);
            });

            const result = await weatherDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/coordinates")
            );
            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/current")
            );

            expect(getRawDataFromQuicksilver).not.toHaveBeenCalled();

            expect(mockCacheManager.set).not.toHaveBeenCalled();

            expect(result).toContain("Current Weather for New York");
        });

        it("should handle errors when WEATHER_CITIES is not set", async () => {
            mockRuntime.getSetting.mockReturnValue("");

            const result = await weatherDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should handle cache errors gracefully", async () => {
            mockCacheManager.get.mockRejectedValue(new Error("Cache error"));

            const result = await weatherDataProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalled();
            expect(result).toContain("Current Weather for New York");
            expect(elizaLogger.error).toHaveBeenCalled();
        });
    });
});
