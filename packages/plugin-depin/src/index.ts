export * from "./actions/sentai";
export * from "./services/quicksilver";

export * from "./schemas/quicksilver";
export * from "./schemas/calculator";
export * from "./schemas/news";
export * from "./schemas/nubila";
export * from "./schemas/depinscan";
export * from "./schemas/iotexl1";
export * from "./schemas/mapbox";

import type { Plugin } from "@elizaos/core";

import { askSentai } from "./actions/sentai";
import { sentaiProvider } from "./providers/sentai";

export const depinPlugin: Plugin = {
    name: "depin",
    description: "DePIN plugin",
    providers: [sentaiProvider],
    evaluators: [
        // Add evaluators here
    ],
    services: [
        // Add services here
    ],
    actions: [askSentai],
};

export default depinPlugin;
