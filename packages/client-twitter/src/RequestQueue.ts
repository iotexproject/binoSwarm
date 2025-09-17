import { elizaLogger } from "@elizaos/core";

const MS_IN_SEC = 1000;
const DELAY_MS = 2000;
const DELAY_RANGE_MS = 1500;

export class RequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private processing: boolean = false;

    async add<T>(request: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            const wrappedRequest = async () => {
                try {
                    // Add timeout wrapper to all requests
                    const timeoutPromise = new Promise<never>(
                        (_, timeoutReject) => {
                            setTimeout(() => {
                                timeoutReject(
                                    new Error(
                                        "Request timed out after 45 seconds"
                                    )
                                );
                            }, 45000);
                        }
                    );

                    const result = await Promise.race([
                        request(),
                        timeoutPromise,
                    ]);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };

            this.queue.push(wrappedRequest);
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        this.processing = true;

        while (this.queue.length > 0) {
            const request = this.queue.shift()!;
            try {
                await request();
            } catch (error) {
                elizaLogger.error("Error processing request:", error);

                // Don't requeue timeout errors to prevent infinite loops
                if (
                    !(
                        error instanceof Error &&
                        error.message.includes("timed out")
                    )
                ) {
                    elizaLogger.warn("Requeuing failed request for retry");
                    this.queue.unshift(request);
                    await this.exponentialBackoff(this.queue.length);
                } else {
                    elizaLogger.error(
                        "Request timed out - not retrying to prevent infinite loop"
                    );
                }
            }
            await this.randomDelay();
        }

        this.processing = false;
    }

    private async exponentialBackoff(retryCount: number): Promise<void> {
        const delay = Math.pow(2, retryCount) * MS_IN_SEC;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    private async randomDelay(): Promise<void> {
        const delay = Math.floor(Math.random() * DELAY_MS) + DELAY_RANGE_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
}
