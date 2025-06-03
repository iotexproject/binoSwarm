import type { Plugin } from "@elizaos/core";
import { icnProvider } from "./providers";

export * from "./types";
export * from "./providers";

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
