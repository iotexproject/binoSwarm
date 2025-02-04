export * from "./actions/weather";
export * from "./actions/depinProjects";
export * from "./actions/recentNews";
export * from "./services/quicksilver";

import type { Plugin } from "@elizaos/core";

// import { depinProjects } from "./actions/depinProjects";
// import { weather } from "./actions/weather";
// import { recentNews } from "./actions/recentNews";
// import { weatherForecast } from "./actions/weatherForecast";
// import { placeBet } from "./actions/placeBet";
// import { prepareBet } from "./actions/prepareBet";
// import { listPredictions } from "./actions/listPredictions";

// import { depinDataProvider } from "./providers/depinData";
// import { weatherDataProvider } from "./providers/weatherDataProvider";
// import { weatherForecastProvider } from "./providers/weatherForecastProvider";

// import { predictionEvaluator } from "./evaluators/predictions";

// import PredictionResolver from "./services/PredictionResolver";

export const depinPlugin: Plugin = {
    name: "depin",
    description: "DePIN plugin",
    providers: [
        // Add providers here
    ],
    evaluators: [
        // Add evaluators here
    ],
    services: [
        // Add services here
    ],
    actions: [
        // Add actions here
    ],
};

export default depinPlugin;
