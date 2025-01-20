import { Provider, State, Memory, IAgentRuntime } from "@elizaos/core";

import { askQuickSilver } from "../services/quicksilver";

export const newsProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<string | null> {
        if (runtime.character.topics.length === 0) {
            return null;
        }

        const randomTopic =
            runtime.character.topics[
                Math.floor(Math.random() * runtime.character.topics.length)
            ];
        const news = await askQuickSilver(
            `What is the latest news on ${randomTopic}?`
        );

        return `
            #### **Latest News on ${randomTopic}**
            ${news}
        `;
    },
};
