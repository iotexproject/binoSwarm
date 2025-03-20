export * from "./actions/generateImage";
export * from "./actions/generateMeme";
export * from "./utils";

import { Plugin } from "@elizaos/core";
import { imageGeneration } from "./actions/generateImage";
import { memeGeneration } from "./actions/generateMeme";

export const imageGenerationPlugin: Plugin = {
    name: "imageGeneration",
    description: "Generate images",
    actions: [imageGeneration, memeGeneration],
    evaluators: [],
    providers: [],
};

export default imageGenerationPlugin;
