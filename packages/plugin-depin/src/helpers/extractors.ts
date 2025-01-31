import {
    IAgentRuntime,
    State,
    ModelClass,
    composeContext,
    generateText,
    elizaLogger,
} from "@elizaos/core";

import { locationQuestionExtractionTemplate } from "../template";
import { parseTagContent } from "./parsers";

const NUM_RECENT_MESSAGES = 7;

export async function extractLocationQuestion(
    state: State,
    runtime: IAgentRuntime
): Promise<string> {
    const locationExtractionContext = composeContext({
        state: {
            ...state,
            recentMessages: getLastMessages(state, NUM_RECENT_MESSAGES),
        },
        template:
            // @ts-expect-error: locationExtractionTemplate should be added to character type
            runtime.character.templates?.locationQuestionExtractionTemplate ||
            locationQuestionExtractionTemplate,
    });
    const location = await generateText({
        runtime,
        context: locationExtractionContext,
        modelClass: ModelClass.SMALL,
    });

    elizaLogger.log("Extracted location is: ", location);

    const parsedLocation = parseTagContent(location, "response");

    elizaLogger.log("Extracted location is: ", parsedLocation);

    return parsedLocation;
}

function getLastMessages(state: State, numMessages: number): string {
    return state.recentMessages.split("\n").slice(-numMessages, -1).join("\n");
}
