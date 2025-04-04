import { REST, Routes } from "discord.js";
import express from "express";

import { DirectClient } from "../client";
import { AgentNotFound } from "../errors";
import { Guild } from "../types";

export async function handleRoot(res: express.Response) {
    res.send(
        "Welcome to the DePIN Revolution's Command Center! This RESTful API is your gateway to the future of decentralized infrastructure. Ready to build something legendary? 🚀"
    );
}

export async function handleHello(res: express.Response) {
    res.send(
        "Hey there! You've just accessed the epicenter of the DePIN revolution's neural network! This isn't just any REST API - it's your gateway to the decentralized future! Ready to build something legendary? 🚀"
    );
}

export async function handleAgents(
    res: express.Response,
    directClient: DirectClient
) {
    const agents = directClient.getAgents();
    const agentsList = Array.from(agents.values()).map((agent) => ({
        id: agent.agentId,
        name: agent.character.name,
        clients: Object.keys(agent.clients),
    }));
    res.json({ agents: agentsList });
}

export async function handleChannels(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    try {
        await fetchDiscordGuilds(req, res, directClient);
    } catch (error) {
        if (error instanceof AgentNotFound) {
            res.status(404).json({
                error: error.message,
            });
        } else {
            res.status(500).json({
                error: "Error processing channels",
                details: error.message,
            });
        }
    }
}

async function fetchDiscordGuilds(
    req: express.Request,
    res: express.Response,
    directClient: DirectClient
) {
    const runtime = directClient.getRuntime(req.params.agentId);

    const API_TOKEN = runtime.getSetting("DISCORD_API_TOKEN") as string;
    const rest = new REST({ version: "10" }).setToken(API_TOKEN);

    const guilds = (await rest.get(Routes.userGuilds())) as Array<Guild>;

    res.json({
        id: runtime.agentId,
        guilds,
        serverCount: guilds.length,
    });
}
