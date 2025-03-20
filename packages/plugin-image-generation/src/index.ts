export * from "./actions/generateImage";
export * from "./utils";

import { Plugin } from "@elizaos/core";
import { imageGeneration } from "./actions/generateImage";

export const imageGenerationPlugin: Plugin = {
    name: "imageGeneration",
    description: "Generate images",
    actions: [imageGeneration],
    evaluators: [],
    providers: [],
};

export default imageGenerationPlugin;
