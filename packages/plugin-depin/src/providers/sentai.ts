import {
    type IAgentRuntime,
    type Provider,
    type Memory,
    type State,
    elizaLogger,
} from "@elizaos/core";

import { depinDataProvider } from "./depinData";
import { weatherDataProvider } from "./weatherDataProvider";
import { weatherForecastProvider } from "./weatherForecastProvider";
import { newsProvider } from "./newsProvider";
import { l1DataProvider } from "./l1DataProvider";

export enum ProviderName {
    DEPIN = "depin",
    WEATHER_CURRENT = "weather-current",
    WEATHER_FORECAST = "weather-forecast",
    NEWS = "news",
    L1_DATA = "l1-data",
}

interface ProviderTool {
    name: ProviderName;
    provider: Provider;
}

class ProviderRegistry {
    private providers: ProviderTool[] = [];
    private enabledSources: ProviderName[] = [];

    constructor(runtime: IAgentRuntime) {
        this.register(ProviderName.DEPIN, depinDataProvider);
        this.register(ProviderName.WEATHER_CURRENT, weatherDataProvider);
        this.register(ProviderName.WEATHER_FORECAST, weatherForecastProvider);
        this.register(ProviderName.NEWS, newsProvider);
        this.register(ProviderName.L1_DATA, l1DataProvider);

        this.setEnabledSources(runtime);
    }

    register(name: ProviderName, provider: Provider): void {
        this.providers.push({ name, provider });
    }

    getProvider(name: ProviderName): Provider | null {
        const providerTool = this.providers.find((p) => p.name === name);
        return providerTool?.provider || null;
    }

    setEnabledSources(runtime: IAgentRuntime): void {
        const sourcesString = runtime.getSetting("SENTAI_SOURCES") || "";

        const sourceStrings = sourcesString.split(",").map((s) => s.trim());

        this.enabledSources = sourceStrings
            .filter((s) => {
                const isValid = Object.values(ProviderName).includes(
                    s as ProviderName
                );
                if (!isValid && s) {
                    elizaLogger.warn(`Invalid source: ${s}`);
                }
                return isValid;
            })
            .map((s) => s as ProviderName);

        if (this.enabledSources.length === 0) {
            this.enabledSources = [];
            elizaLogger.info(
                `No valid sources specified, using defaults: ${this.enabledSources.join(
                    ","
                )}`
            );
        }
    }

    getEnabledSources(): ProviderName[] {
        return this.enabledSources;
    }

    async fetchFromEnabledSources(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string[]> {
        const results: string[] = [];

        for (const source of this.enabledSources) {
            try {
                const provider = this.getProvider(source);
                if (!provider) {
                    elizaLogger.warn(
                        `Provider not found for source: ${source}`
                    );
                    continue;
                }

                elizaLogger.info(`Fetching data from provider: ${source}`);
                const result = await provider.get(runtime, message, state);
                if (result) {
                    results.push(result);
                }
            } catch (error) {
                elizaLogger.error(
                    `Error fetching data from provider ${source}:`,
                    error
                );
            }
        }

        return results;
    }
}

class SentaiProvider implements Provider {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string> {
        try {
            const registry = new ProviderRegistry(runtime);
            const results = await registry.fetchFromEnabledSources(
                runtime,
                message,
                state
            );

            if (results.length === 0) {
                return "No data sources were specified or available.";
            }

            return results.join("\n\n");
        } catch (error) {
            elizaLogger.error("Error in SentaiProvider:", error.message);
            return "";
        }
    }
}

export const sentaiProvider = new SentaiProvider();
