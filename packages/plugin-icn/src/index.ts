import type { Plugin } from "@elizaos/core";
import { icnProvider } from "./providers/ImpossibleCloudProvider";

export * from "./types";
export * from "./providers/ImpossibleCloudProvider";

export const icnPlugin: Plugin = {
    name: "icn",
    description:
        "Impossible Cloud Network plugin for fetching network statistics.",
    providers: [icnProvider],
    evaluators: [],
    services: [],
    actions: [],
};

export default icnPlugin;
