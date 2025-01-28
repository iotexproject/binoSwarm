export * from "./actions/weather";
export * from "./actions/depinProjects";
export * from "./actions/recentNews";
export * from "./services/quicksilver";

import type { Plugin } from "@elizaos/core";

import { depinDataProvider } from "./providers/depinData";
import { depinProjects } from "./actions/depinProjects";
import { weather } from "./actions/weather";
import { recentNews } from "./actions/recentNews";
import { weatherDataProvider } from "./providers/weatherDataProvider";
import { weatherForecast } from "./actions/weatherForecast";
import { predictionEvaluator } from "./evaluators/predictions";
import PredictionResolver from "./services/PredictionResolver";
import { placeBet } from "./actions/placeBet";
import { prepareBet } from "./actions/prepareBet";
import { listPredictions } from "./actions/listPredictions";

export const depinPlugin: Plugin = {
    name: "depin",
    description: "DePIN plugin",
    providers: [depinDataProvider, weatherDataProvider],
    evaluators: [predictionEvaluator],
    services: [new PredictionResolver()],
    actions: [
        depinProjects,
        weather,
        recentNews,
        weatherForecast,
        placeBet,
        prepareBet,
        listPredictions,
    ],
};

export default depinPlugin;
