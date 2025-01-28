import { elizaLogger, IAgentRuntime } from "@elizaos/core";
import { initWalletProvider } from "@elizaos/plugin-evm";
import { encodeFunctionData } from "viem";
import { iotex, iotexTestnet } from "viem/chains";

import { predictionAbi } from "./predictionAbi";
import { erc20Abi } from "./erc20abi";

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

export const placeBet = async (
    runtime: IAgentRuntime,
    predictionId: number,
    outcome: boolean,
    amount: number,
    bettor: `0x${string}`,
    network: "iotex" | "iotexTestnet"
) => {
    const walletProvider = await initWalletProvider(runtime);
    const publicClient = walletProvider.getPublicClient(network);
    const account = walletProvider.getAddress();

    const betAmount = await getBetAmount(amount, bettor, account, publicClient);

    await publicClient.simulateContract({
        address: process.env
            .BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`,
        abi: predictionAbi,
        account,
        functionName: "placeBetForAccount",
        args: [bettor, BigInt(predictionId), outcome, BigInt(betAmount)],
    });

    const data = encodeFunctionData({
        abi: predictionAbi,
        functionName: "placeBetForAccount",
        args: [bettor, BigInt(predictionId), outcome, BigInt(betAmount)],
    });

    const walletClient = walletProvider.getWalletClient(network);
    // @ts-ignore
    const request = await walletClient.prepareTransactionRequest({
        to: process.env.BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`,
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

const getBetAmount = async (
    amount: number,
    bettor: `0x${string}`,
    account: `0x${string}`,
    publicClient: any
) => {
    const allowance = await publicClient.readContract({
        address: process.env.SENTAI_ERC20 as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [bettor, account],
    });

    if (allowance <= BigInt(0)) {
        throw new Error("Insufficient allowance");
    }

    const maxBet = await publicClient.readContract({
        address: process.env
            .BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`,
        abi: predictionAbi,
        functionName: "maxBet",
    });

    const minBet = await publicClient.readContract({
        address: process.env
            .BINARY_PREDICTION_CONTRACT_ADDRESS as `0x${string}`,
        abi: predictionAbi,
        functionName: "minBet",
    });

    if (amount < minBet) {
        throw new Error("Bet amount is less than the minimum bet");
    }

    const betAmount = Math.min(maxBet, amount);

    if (allowance < BigInt(betAmount)) {
        throw new Error("Insufficient allowance");
    }

    return betAmount;
};
