export * from "./actions";

import type { Plugin } from "@elizaos/core";

import { callCollaboratorAction } from "./actions";

export const swarmPlugin: Plugin = {
    name: "swarm",
    description: "Swarm plugin",
    providers: [],
    evaluators: [],
    services: [],
    actions: [callCollaboratorAction],
};