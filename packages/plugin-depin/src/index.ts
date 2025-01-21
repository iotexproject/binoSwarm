import type { Plugin } from "@elizaos/core";

import { depinDataProvider } from "./providers/depinData";
import { depinProjects } from "./actions/depinProjects";
import { weather } from "./actions/weather";
import { recentNews } from "./actions/recentNews";
import { weatherDataProvider } from "./providers/weatherDataProvider";
import { weatherForecast } from "./actions/weatherForecast";

export const depinPlugin: Plugin = {
    name: "depin",
    description: "DePIN plugin",
    providers: [depinDataProvider, weatherDataProvider],
    evaluators: [],
    services: [],
    actions: [depinProjects, weather, recentNews, weatherForecast],
};

export default depinPlugin;
