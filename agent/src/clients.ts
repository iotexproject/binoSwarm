import { AutoClientInterface } from "@elizaos/client-auto";
import { DiscordClientInterface } from "@elizaos/client-discord";
import { TelegramClientInterface } from "@elizaos/client-telegram";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { Character, Clients, elizaLogger, IAgentRuntime } from "@elizaos/core";

export async function initializeClients(
    character: Character,
    runtime: IAgentRuntime
) {
    const clients: Record<string, any> = {};
    const clientTypes = extractClientTypesFromCharacter(character);

    if (clientTypes.includes(Clients.AUTO)) {
        const autoClient = await AutoClientInterface.start(runtime);
        if (autoClient) clients.auto = autoClient;
    }

    if (clientTypes.includes(Clients.DISCORD)) {
        const discordClient = await DiscordClientInterface.start(runtime);
        if (discordClient) clients.discord = discordClient;
    }

    if (clientTypes.includes(Clients.TELEGRAM)) {
        const telegramClient = await TelegramClientInterface.start(runtime);
        if (telegramClient) clients.telegram = telegramClient;
    }

    if (clientTypes.includes(Clients.TWITTER)) {
        const twitterClient = await TwitterClientInterface.start(runtime);
        if (twitterClient) {
            clients.twitter = twitterClient;
        }
    }

    return clients;
}

function extractClientTypesFromCharacter(character: Character): string[] {
    const clients = character.clients?.map((str) => str.toLowerCase()) || [];
    elizaLogger.log("initializeClients", ...clients, "for", character.name);
    return clients;
}
