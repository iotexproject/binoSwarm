import { Content, UUID } from "@elizaos/core";
import type { Request as ExpressRequest } from "express";

export interface CustomRequest extends ExpressRequest {
    file?: Express.Multer.File;
}

export type Guild = {
    id: string;
    name: string;
    icon: string | null;
    banner: string | null;
    owner: boolean;
};

export type UserMessage = {
    content: Content;
    userId: UUID;
    roomId: UUID;
    agentId: UUID;
};
