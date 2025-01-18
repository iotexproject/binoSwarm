export * from "./helpers/blockchain";

import type { Plugin } from "@elizaos/core";

import { predictionEvaluator } from "./evaluators/prediction";
import { predictionAction } from "./actions/prediction";

export const predictionPlugin: Plugin = {
    name: "prediction",
    description: "Prediction plugin",
    providers: [],
    evaluators: [predictionEvaluator],
    services: [],
    actions: [predictionAction],
};

export default predictionPlugin;
