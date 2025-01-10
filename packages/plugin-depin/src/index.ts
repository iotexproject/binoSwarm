import type { Plugin } from "@elizaos/core";

import { depinDataProvider } from "./providers/depinData";
import { depinProjects } from "./actions/depinProjects";
import { weather } from "./actions/weather";
import { recentNews } from "./actions/recentNews";
export const depinPlugin: Plugin = {
    name: "depin",
    description: "DePIN plugin",
    providers: [depinDataProvider],
    evaluators: [],
    services: [],
    actions: [depinProjects, weather, recentNews],
};

export default depinPlugin;
