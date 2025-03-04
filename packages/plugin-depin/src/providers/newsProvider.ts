import {
    IAgentRuntime,
    Memory,
    State,
    Provider,
    elizaLogger,
    ICacheManager,
} from "@elizaos/core";
import { getRawDataFromQuicksilver } from "../services/quicksilver";

interface NewsAPIResponse {
    status: string;
    totalResults: number;
    articles: {
        source: { name: string };
        title: string;
        url: string;
        description: string | null;
        publishedAt: string;
        urlToImage: string | null;
        content: string | null;
    }[];
}

class NewsProvider implements Provider {
    private cacheManager: ICacheManager;
    private readonly NEWS_CACHE_KEY = "news/technology";
    private readonly NEWS_CACHE_TTL = 60 * 60; // 1 hour in seconds
    private readonly MAX_HEADLINES = 10;

    constructor(runtime: IAgentRuntime) {
        this.cacheManager = runtime.cacheManager;
    }

    private async readFromCache<T>(key: string): Promise<T | null> {
        try {
            const cached = await this.cacheManager.get<T>(key);
            return cached;
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

    private async fetchNewsData(): Promise<NewsAPIResponse> {
        elizaLogger.info("Fetching technology news from Quicksilver");

        const newsData = await getRawDataFromQuicksilver("news", {
            category: "technology",
            q: "",
        });

        return newsData;
    }

    private formatNewsData(newsData: NewsAPIResponse): string {
        if (!newsData || !newsData.articles || newsData.articles.length === 0) {
            return "No technology news available at this time.";
        }

        const articles = newsData.articles.slice(0, this.MAX_HEADLINES);

        let result = `## Technology News Headlines\n\n`;

        articles.forEach((article, index) => {
            const date = new Date(article.publishedAt).toLocaleDateString();
            result += `${index + 1}. **${article.title}** - ${article.source.name} (${date})\n`;
            if (article.description) {
                result += `   ${article.description}\n`;
            }
            result += `   [Read more](${article.url})\n\n`;
        });

        return result;
    }

    async get(
        _runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string> {
        try {
            const cachedNews = await this.readFromCache<NewsAPIResponse>(
                this.NEWS_CACHE_KEY
            );

            let newsData: NewsAPIResponse;

            if (cachedNews) {
                elizaLogger.info("Using cached technology news");
                newsData = cachedNews;
            } else {
                newsData = await this.fetchNewsData();

                await this.writeToCache(
                    this.NEWS_CACHE_KEY,
                    newsData,
                    this.NEWS_CACHE_TTL
                );
            }

            return this.formatNewsData(newsData);
        } catch (error) {
            elizaLogger.error("Error fetching technology news:", error);
            return "";
        }
    }
}

export const newsProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<string | null> {
        return new NewsProvider(runtime).get(runtime, message, state);
    },
};
