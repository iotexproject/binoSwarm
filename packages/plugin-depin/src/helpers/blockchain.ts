import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import { initWalletProvider } from "@elizaos/plugin-evm";
import { encodeFunctionData } from "viem";
import { iotex, iotexTestnet } from "viem/chains";

import { predictionAbi } from "./predictionAbi";

export const resolvePrediction = async (
    runtime: IAgentRuntime,
    predictionId: number,
    outcome: boolean,
    network: "iotex" | "iotexTestnet"
) => {
    const contractAddress = process.env
        .BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`;
    const walletProvider = await initWalletProvider(runtime);
    const publicClient = walletProvider.getPublicClient(network);
    const account = walletProvider.getAddress();

    await publicClient.simulateContract({
        chain: network === "iotex" ? iotex : iotexTestnet,
        address: contractAddress,
        abi: predictionAbi,
        account,
        functionName: "resolvePrediction",
        args: [BigInt(predictionId), outcome],
    });

    const data = encodeFunctionData({
        abi: predictionAbi,
        functionName: "resolvePrediction",
        args: [BigInt(predictionId), outcome],
    });

    const walletClient = walletProvider.getWalletClient(network);
    // @ts-ignore
    const request = await walletClient.prepareTransactionRequest({
        to: contractAddress,
        data,
        account: walletClient.account,
    });
    // @ts-ignore
    const serializedTransaction = await walletClient.signTransaction(request);
    const hash = await walletClient.sendRawTransaction({
        serializedTransaction,
    });

    elizaLogger.info(hash);
    return hash;
};

export const createPrediction = async (
    runtime: IAgentRuntime,
    address: `0x${string}`,
    statement: string,
    deadline: number,
    network: "iotex" | "iotexTestnet"
) => {
    const walletProvider = await initWalletProvider(runtime);
    const publicClient = walletProvider.getPublicClient(network);
    const account = walletProvider.getAddress();

    const nextPredictionId = await publicClient.readContract({
        address,
        abi: predictionAbi,
        functionName: "predictionCount",
    });
    await publicClient.simulateContract({
        chain: network === "iotex" ? iotex : iotexTestnet,
        address,
        abi: predictionAbi,
        account,
        functionName: "createPrediction",
        args: [statement, BigInt(deadline), account],
    });
    const data = encodeFunctionData({
        abi: predictionAbi,
        functionName: "createPrediction",
        args: [statement, BigInt(deadline), account],
    });

    const walletClient = walletProvider.getWalletClient(network);
    // @ts-ignore
    const requestt = await walletClient.prepareTransactionRequest({
        to: address,
        data,
        account: walletClient.account,
    });
    // @ts-ignore
    const serializedTransaction = await walletClient.signTransaction(requestt);
    const hash = await walletClient.sendRawTransaction({
        serializedTransaction,
    });

    elizaLogger.info(hash);

    const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
    });
    if (receipt.status === "success") {
        return nextPredictionId;
    } else {
        throw new Error("Prediction creation failed");
    }
};
