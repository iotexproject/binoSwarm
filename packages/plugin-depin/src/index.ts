export * from "./actions/sentai";
export * from "./services/quicksilver";

import type { Plugin } from "@elizaos/core";

// import { placeBet } from "./actions/placeBet";
// import { prepareBet } from "./actions/prepareBet";
// import { listPredictions } from "./actions/listPredictions";
import { sentai } from "./actions/sentai";

import { depinDataProvider } from "./providers/depinData";
import { weatherDataProvider } from "./providers/weatherDataProvider";
import { weatherForecastProvider } from "./providers/weatherForecastProvider";

// import { predictionEvaluator } from "./evaluators/predictions";

// import PredictionResolver from "./services/PredictionResolver";

export const depinPlugin: Plugin = {
    name: "depin",
    description: "DePIN plugin",
    providers: [
        depinDataProvider,
        weatherDataProvider,
        weatherForecastProvider,
    ],
    evaluators: [
        // Add evaluators here
    ],
    services: [
        // Add services here
    ],
    actions: [
        sentai,
    ],
};

export default depinPlugin;
