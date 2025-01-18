import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import { initWalletProvider } from "@elizaos/plugin-evm";
import { encodeFunctionData } from "viem";
import { iotex } from "viem/chains";

import { predictionAbi } from "./predictionAbi";

export const resolvePrediction = async (
    runtime: IAgentRuntime,
    predictionId: number,
    outcome: boolean
) => {
    const contractAddress = process.env
        .BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`;
    const network = "iotex";
    const walletProvider = await initWalletProvider(runtime);
    const publicClient = walletProvider.getPublicClient(network);
    const account = walletProvider.getAddress();

    await publicClient.simulateContract({
        chain: iotex,
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
    deadline: number
) => {
    const network = "iotex";
    const walletProvider = await initWalletProvider(runtime);
    const publicClient = walletProvider.getPublicClient(network);
    const account = walletProvider.getAddress();

    const nextPredictionId = await publicClient.readContract({
        address,
        abi: predictionAbi,
        functionName: "predictionCount",
    });
    await publicClient.simulateContract({
        chain: iotex,
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
