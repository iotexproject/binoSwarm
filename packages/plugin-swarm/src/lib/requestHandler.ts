import { http, createWalletClient, walletActions } from "viem";
import { iotex } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { elizaLogger, getEnvVariable } from "@elizaos/core";

function getWalletClient() {
    const privateKey = getEnvVariable("EVM_PRIVATE_KEY");
    if (!privateKey) {
        throw new Error("EVM_PRIVATE_KEY environment variable not set.");
    }
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = http(iotex.rpcUrls.default.http[0]);
    return createWalletClient({
        chain: iotex,
        transport,
        account,
    }).extend(walletActions);
}

export async function callAgent(
    agentUrl: string,
    message: string,
    onData: (data: string) => void
): Promise<void> {
    const walletClient = getWalletClient();
    // @ts-expect-error - walletClient is a WalletClient
    const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);

    const url = `${agentUrl}/message-paid`;

    const response = await fetchWithPayment(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            text: message,
            // internal room id between agents, collaborator agent will track questions
            // from all agents in this room
            roomId: url,
            // user id is not important, and shouldn't be constant for the agent since the
            // questions are coming from different users and clients
            // Keeping changing based on timestamp is enough
            userId: Date.now().toString(),
        }),
    });

    elizaLogger.info("response:", response);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Request to ${url} failed with status ${response.status}: ${errorText}`
        );
    }

    if (!response.body) {
        throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const data = line.substring(6).trim();
                if (data) {
                    onData(data);
                }
            }
        }
    }
}
