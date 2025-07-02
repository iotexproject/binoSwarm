import { z } from "zod";
import { callAgent } from "../lib/x402";

const description = `Calls another agent to collaborate on a task. Use this when you need help from an agent with a specific specialization. You will be provided with a list of available agents and their specializations.`;

export const callAgentTool = {
    name: "call_collaborator_agent",
    description,
    parameters: z.object({
        agent_url: z.string().url("A valid URL for the agent to be called."),
        message: z.string().min(1, "Message cannot be empty."),
    }),
    execute: async (args: { agent_url: string; message: string }) => {
        try {
            let response = "";
            await callAgent(args.agent_url, args.message, (chunk) => {
                response += chunk;
            });
            return response;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "An unknown error occurred";
            return `Failed to call collaborator agent: ${message}`;
        }
    },
};
