import { describe, expect, it, vi, beforeEach } from "vitest";
import { weatherForecastProvider } from "../providers/weatherForecastProvider";
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
            } else if (endpoint === "weather-forecast") {
                return Promise.resolve([
                    {
                        date: "2023-06-01",
                        temperature_min: 18.5,
                        temperature_max: 25.2,
                        condition: "Clear",
                        condition_desc: "Clear sky",
                        condition_code: 800,
                        precipitation_probability: 0,
                        precipitation: 0,
                        humidity: 65,
                        wind_speed: 5.2,
                        wind_direction: 180,
                        uv: 4,
                        location_name: "New York",
                        parsed_timestamp: "2023-06-01",
                    },
                    {
                        date: "2023-06-02",
                        temperature_min: 19.0,
                        temperature_max: 26.5,
                        condition: "Clouds",
                        condition_desc: "Scattered clouds",
                        condition_code: 802,
                        precipitation_probability: 20,
                        precipitation: 0.5,
                        humidity: 70,
                        wind_speed: 6.1,
                        wind_direction: 200,
                        uv: 3,
                        location_name: "New York",
                        parsed_timestamp: "2023-06-02",
                    },
                ]);
            }
            return Promise.reject(new Error("Unknown endpoint"));
        }),
}));

import { getRawDataFromQuicksilver } from "../services/quicksilver";

describe("WeatherForecastProvider", () => {
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
        it("should fetch and format weather forecast data when not cached", async () => {
            mockCacheManager.get.mockResolvedValue(undefined);

            const result = (await weatherForecastProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            )) as string;

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/coordinates")
            );
            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/forecast")
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "mapbox",
                expect.any(Object)
            );
            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "weather-forecast",
                {
                    lat: 40.7128,
                    lon: -74.006,
                }
            );

            expect(mockCacheManager.set).toHaveBeenCalledTimes(2);

            expect(result).toContain("Weather Forecast for New York");
            expect(result).toContain("Date: 2023-06-01");
            expect(result).toContain("Date: 2023-06-02");
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

            const result = await weatherForecastProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/coordinates")
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalledWith(
                "weather-forecast",
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
                expect.stringContaining("weather/forecast"),
                expect.any(Object),
                expect.any(Object)
            );

            expect(result).toContain("Weather Forecast for New York");
        });

        it("should use cached forecast data when available", async () => {
            const cachedForecastData = [
                {
                    date: "2023-06-01",
                    temperature_min: 18.5,
                    temperature_max: 25.2,
                    condition: "Clear",
                    condition_desc: "Clear sky",
                    condition_code: 800,
                    precipitation_probability: 0,
                    precipitation: 0,
                    humidity: 65,
                    wind_speed: 5.2,
                    wind_direction: 180,
                    uv: 4,
                    location_name: "New York",
                    parsed_timestamp: "2023-06-01",
                },
                {
                    date: "2023-06-02",
                    temperature_min: 19.0,
                    temperature_max: 26.5,
                    condition: "Clouds",
                    condition_desc: "Scattered clouds",
                    condition_code: 802,
                    precipitation_probability: 20,
                    precipitation: 0.5,
                    humidity: 70,
                    wind_speed: 6.1,
                    wind_direction: 200,
                    uv: 3,
                    location_name: "New York",
                    parsed_timestamp: "2023-06-02",
                },
            ];

            mockCacheManager.get.mockImplementation((key) => {
                if (key.includes("weather/coordinates")) {
                    return Promise.resolve({
                        features: [
                            {
                                geometry: { coordinates: [-74.006, 40.7128] },
                            },
                        ],
                    });
                } else if (key.includes("weather/forecast")) {
                    return Promise.resolve(cachedForecastData);
                }
                return Promise.resolve(undefined);
            });

            const result = await weatherForecastProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/coordinates")
            );
            expect(mockCacheManager.get).toHaveBeenCalledWith(
                expect.stringContaining("weather/forecast")
            );

            expect(getRawDataFromQuicksilver).not.toHaveBeenCalled();

            expect(mockCacheManager.set).not.toHaveBeenCalled();

            expect(result).toContain("Weather Forecast for New York");
        });

        it("should handle errors when WEATHER_CITIES is not set", async () => {
            mockRuntime.getSetting.mockReturnValue("");

            const result = await weatherForecastProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(result).toBe("");
            expect(elizaLogger.error).toHaveBeenCalled();
        });

        it("should handle cache errors gracefully", async () => {
            mockCacheManager.get.mockRejectedValue(new Error("Cache error"));

            const result = await weatherForecastProvider.get(
                mockRuntime,
                mockMessage,
                mockState
            );

            expect(getRawDataFromQuicksilver).toHaveBeenCalled();
            expect(result).toContain("Weather Forecast for New York");
            expect(elizaLogger.error).toHaveBeenCalled();
        });
    });
});
