import { z } from "zod";

export const qsSchema = {
    name: "roundtable",
    description: "A roundtable discussion about the topic",
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
