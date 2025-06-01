import type { Plugin } from "@elizaos/core";
import { mUpload } from "./upload.ts";

export const mPlugin: Plugin = {
    description: "Membase Plugin for Eliza",
    name: "Membase",
    actions: [mUpload],
    evaluators: [],
    providers: [],
};

export default mPlugin;
