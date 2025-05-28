import fetch from 'node-fetch';
import { Agent } from "node:https";
import { URLSearchParams } from "node:url";

// Define interfaces
interface UploadTask {
    owner: string;
    filename: string;
    msg: string;
    resolve: (value: UploadResult | null) => void;
}

interface UploadResult {
    status: "completed" | "queued";
    message: string;
}

interface MemeStruct {
    Owner: string;
    ID: string;
    Message: string;
}

// Create logger utility
const logger = {
    debug: (msg: string) => console.debug(msg),
    error: (msg: string) => console.error(msg),
};

export class Client {
    private baseUrl: string;
    private uploadQueue: UploadTask[];
    private isProcessing: boolean;
    private agent: Agent;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace("http:", "https:");
        if (!this.baseUrl.startsWith("https://")) {
            this.baseUrl = "https://" + this.baseUrl.replace("https://", "");
        }
        this.uploadQueue = [];
        this.isProcessing = false;
        this.agent = new Agent({
            rejectUnauthorized: false,
        });

        this.processUploadQueue();
    }

    private async processUploadQueue(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        while (true) {
            if (this.uploadQueue.length === 0) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                continue;
            }

            const task = this.uploadQueue.shift();
            if (!task) continue;

            try {
                const { owner, filename, msg, resolve } = task;
                const memeStruct: MemeStruct = {
                    Owner: owner,
                    ID: filename,
                    Message: msg,
                };

                const response = await fetch(`${this.baseUrl}/api/upload`, {
                    method: "POST",
                    body: JSON.stringify(memeStruct),
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    agent: this.agent,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                logger.debug(`Upload done: ${JSON.stringify(data)}`);
                resolve({
                    status: "completed",
                    message: "Upload task completed",
                });
            } catch (err) {
                logger.error(
                    `Error during upload: ${err instanceof Error ? err.message : String(err)}`
                );
                task.resolve(null);
            }

            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    public uploadHub(
        owner: string,
        filename: string,
        msg: string,
        wait: boolean = true
    ): Promise<UploadResult | null> {
        return new Promise((resolve) => {
            this.uploadQueue.push({ owner, filename, msg, resolve });
            logger.debug(`Upload task queued: ${owner}/${filename}`);

            if (!wait) {
                resolve({
                    status: "queued",
                    message: "Upload task has been queued",
                });
            }
        });
    }

    public async uploadHubData(
        owner: string,
        filename: string,
        data: Buffer
    ): Promise<any> {
        try {
            const formData = new FormData();
            const blob = new Blob([data], { type: "application/octet-stream" });
            formData.append("file", blob, filename);
            formData.append("owner", owner);

            const response = await fetch(`${this.baseUrl}/api/uploadData`, {
                method: "POST",
                body: formData as any,
                agent: this.agent,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseData = await response.json();
            logger.debug(`Upload done: ${JSON.stringify(responseData)}`);
            return responseData;
        } catch (err) {
            logger.error(
                `Error during upload: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    public async listConversations(owner: string): Promise<any> {
        try {
            const formData = new URLSearchParams();
            formData.append("owner", owner);

            const response = await fetch(`${this.baseUrl}/api/conversation`, {
                method: "POST",
                body: formData,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                agent: this.agent,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (err) {
            logger.error(
                `Error during list conversations: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    public async getConversation(
        owner: string,
        conversationId: string
    ): Promise<any> {
        try {
            const formData = new URLSearchParams();
            formData.append("owner", owner);
            formData.append("id", conversationId);

            const response = await fetch(`${this.baseUrl}/api/conversation`, {
                method: "POST",
                body: formData,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                agent: this.agent,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (err) {
            logger.error(
                `Error during get conversation: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    public async downloadHub(
        owner: string,
        filename: string
    ): Promise<Buffer | null> {
        try {
            const formData = new URLSearchParams();
            formData.append("id", filename);
            formData.append("owner", owner);

            logger.debug(
                `Downloading ${owner} ${filename} from hub ${this.baseUrl}`
            );

            const response = await fetch(`${this.baseUrl}/api/download`, {
                method: "POST",
                body: formData,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                agent: this.agent,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (err) {
            logger.error(
                `Error during download: ${err instanceof Error ? err.message : String(err)}`
            );
            return null;
        }
    }

    public async waitForUploadQueue(): Promise<void> {
        while (this.uploadQueue.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
}
