import type { Plugin } from "@elizaos/core";
import { readTweetAction } from "./actions/readTweet";
import { tweetResponseTemplate } from "./template";

const PLUGIN_NAME = "twitter";
const PLUGIN_DESCRIPTION = "Twitter plugin";

export const twitterPlugin: Plugin = {
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    providers: [],
    evaluators: [],
    services: [],
    actions: [readTweetAction],
};

// Export template for characters to include
export { tweetResponseTemplate };

export default twitterPlugin;
