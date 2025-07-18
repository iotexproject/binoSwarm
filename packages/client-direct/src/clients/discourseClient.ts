import { elizaLogger, getEnvVariable } from "@elizaos/core";
import {
    DiscoursePostRequest,
    DiscoursePostResponse,
    DiscourseApiError,
} from "../types/discourse";

export class DiscourseClient {
    private baseUrl: string;
    private apiKey: string;
    private apiUsername: string;

    constructor(baseUrl?: string, apiKey?: string, apiUsername?: string) {
        this.baseUrl = baseUrl || this.getRequiredEnvVar("DISCOURSE_BASE_URL");
        this.apiKey = apiKey || this.getRequiredEnvVar("DISCOURSE_API_KEY");
        this.apiUsername =
            apiUsername || this.getRequiredEnvVar("DISCOURSE_API_USERNAME");

        this.validateConfiguration();
    }

    async createPost(
        postData: DiscoursePostRequest
    ): Promise<DiscoursePostResponse> {
        this.validatePostData(postData);

        try {
            const response = await this.makeApiRequest(
                "POST",
                "/posts.json",
                postData
            );

            if (!response.ok) {
                await this.handleApiError(response);
            }

            const result: DiscoursePostResponse = await response.json();
            return result;
        } catch (error) {
            elizaLogger.error("Failed to create Discourse post:", error);
            throw this.createDiscourseError("Failed to create post", error);
        }
    }

    private async makeApiRequest(
        method: string,
        endpoint: string,
        data?: any
    ): Promise<Response> {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = this.buildAuthHeaders();

        const requestOptions: RequestInit = {
            method,
            headers,
        };

        if (data && method !== "GET") {
            requestOptions.body = JSON.stringify(data);
        }

        elizaLogger.debug("Making Discourse API request", {
            method,
            url: this.sanitizeUrlForLogging(url),
            hasData: !!data,
        });

        return fetch(url, requestOptions);
    }

    private buildAuthHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "Api-Key": this.apiKey,
            "Api-Username": this.apiUsername,
        };
    }

    private async handleApiError(response: Response): Promise<never> {
        let errorDetails: string;

        try {
            const errorBody: DiscourseApiError = await response.json();
            errorDetails = errorBody.errors?.join(", ") || "Unknown API error";
        } catch {
            errorDetails = `HTTP ${response.status}: ${response.statusText}`;
        }

        throw new Error(`Discourse API error: ${errorDetails}`);
    }

    private validatePostData(postData: DiscoursePostRequest): void {
        if (!postData.raw || postData.raw.trim().length === 0) {
            throw new Error(
                "Post content (raw) is required and cannot be empty"
            );
        }

        if (!postData.topic_id || postData.topic_id <= 0) {
            throw new Error("Valid topic_id is required");
        }

        if (postData.raw.length > 32000) {
            throw new Error(
                "Post content exceeds maximum length of 32,000 characters"
            );
        }
    }

    private validateConfiguration(): void {
        if (!this.baseUrl.startsWith("http")) {
            throw new Error(
                "DISCOURSE_BASE_URL must be a valid HTTP/HTTPS URL"
            );
        }

        if (this.apiKey.length < 32) {
            throw new Error(
                "DISCOURSE_API_KEY appears to be invalid (too short)"
            );
        }

        if (!this.apiUsername || this.apiUsername.trim().length === 0) {
            throw new Error("DISCOURSE_API_USERNAME is required");
        }
    }

    private getRequiredEnvVar(varName: string): string {
        const value = getEnvVariable(varName);
        if (!value) {
            throw new Error(
                `Required environment variable ${varName} is not set`
            );
        }
        return value;
    }

    private sanitizeUrlForLogging(url: string): string {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        } catch {
            return "[invalid URL]";
        }
    }

    private createDiscourseError(message: string, originalError: any): Error {
        const error = new Error(message);
        error.name = "DiscourseError";

        if (originalError) {
            error.cause = originalError;
        }

        return error;
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.makeApiRequest("GET", "/site.json");
            return response.ok;
        } catch (error) {
            elizaLogger.error("Discourse connection test failed:", error);
            return false;
        }
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }
}
