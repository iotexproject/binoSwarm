export * from "./services/index.ts";

import { Plugin } from "@elizaos/core";

import {
    BrowserService,
    ImageDescriptionService,
    PdfService,
    SpeechService,
    TranscriptionService,
    VideoService,
} from "./services/index.ts";
// import { describeImage } from "./actions/describe-image.ts";

export type NodePlugin = ReturnType<typeof createNodePlugin>;

export function createNodePlugin() {
    return {
        name: "default",
        description: "Default plugin, with basic actions and evaluators",
        services: [
            new BrowserService(),
            new ImageDescriptionService(),
            new PdfService(),
            new SpeechService(),
            new TranscriptionService(),
            new VideoService(),
        ],
        actions: [],
    } as const satisfies Plugin;
}
