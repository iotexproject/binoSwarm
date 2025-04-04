import { z } from "zod";

const description = `
Provides real-time data access for answering factual questions about the world.
Use for NEWS, BLOCKCHAIN, ENVIRONMENT, FINANCE, NAVIGATION, UTILITIES questions.
`;
export const qsSchema = {
    name: "quicksilver",
    description,
    parameters: z.object({
        expert_roundtable: z.string(),
        question: z.string(),
    }),
    execute: async (args: { question: string }) => {
        const answer = await askQuickSilver(args.question);
        return answer;
    },
};

async function askQuickSilver(content: string): Promise<string> {
    const url = process.env.QUICKSILVER_URL || "https://quicksilver.iotex.ai";
    const response = await fetch(url + "/ask", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            q: content,
        }),
    });

    const data = await response.json();

    if (data.data) {
        return data.data;
    } else {
        throw new Error("Failed to fetch weather data");
    }
}

export default qsSchema;
