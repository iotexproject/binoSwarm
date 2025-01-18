import { Prediction } from "@elizaos/core";
import {
    Client,
    IAgentRuntime,
    ModelClass,
    elizaLogger,
    generateText,
    parseBooleanFromText,
} from "@elizaos/core";
import { askQuickSilver } from "@elizaos/plugin-depin";
import { resolvePrediction } from "@elizaos/plugin-prediction";

export class AutoClient {
    interval: NodeJS.Timeout;
    runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;

        // start a loop that runs every x seconds
        this.interval = setInterval(async () => {
            elizaLogger.log("running auto client...");
            const predictions =
                await this.runtime.databaseAdapter.getReadyActivePredictions();
            predictions.forEach(async (prediction) => {
                const weather = await getWeather(prediction, this.runtime);
                elizaLogger.info(weather);

                const outcome = await getOutcome(
                    weather,
                    prediction,
                    this.runtime
                );
                elizaLogger.info(outcome);
                const hash = await resolvePrediction(
                    this.runtime,
                    Number(prediction.smartcontract_id),
                    outcome
                );

                if (hash) {
                    await runtime.databaseAdapter.resolvePrediction(
                        prediction.id,
                        outcome
                    );
                }
            });
        }, 15 * 1000); // 10 seconds in milliseconds
    }
}

export const AutoClientInterface: Client = {
    start: async (runtime: IAgentRuntime) => {
        const client = new AutoClient(runtime);
        return client;
    },
    stop: async (_runtime: IAgentRuntime) => {
        console.warn("Direct client does not support stopping yet");
    },
};

export default AutoClientInterface;

const getWeather = async (prediction: Prediction, runtime: IAgentRuntime) => {
    const prompt = questionTemplate.replace(
        "{{statement}}",
        prediction.statement
    );
    const question = await generateText({
        runtime: runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
    });
    return askQuickSilver(question);
};

const getOutcome = async (
    weather: string,
    prediction: Prediction,
    runtime: IAgentRuntime
) => {
    const decisionPrompt = decisionTemplate
        .replace("{{statement}}", prediction.statement)
        .replace("{{weather_data}}", weather);

    const decisionResponse = await generateText({
        runtime: runtime,
        context: decisionPrompt,
        modelClass: ModelClass.SMALL,
    });
    return parseBooleanFromText(decisionResponse);
};

const questionTemplate = `
Extract a weather-related question from the following statement. The question should focus on retrieving relevant weather data to verify the statement.

<example>
Statement: Temperature in Ulaanbaatar will reach +10 degrees.
Question: What is the CURRENT temperature in Ulaanbaatar?
</example>

<example>
Statement: Moscow's wind patterns will remain measurable and consistent with historical data over the next 60 years
Question: What is the CURRENT wind pattern in Moscow?
</example>

Note: The question should be a single question about the CURRENT state of the weather.

Statement: {{statement}}
Question:
`;

const decisionTemplate = `
Decide if the provided prediction statement is true or false based on the actual weather data. Analyze only the relevant information from the weather data.

<example>
Prediction Statement: Temperature in Ulaanbaatar will reach +10 degrees
Actual Weather: The weather in Ulaanbaatar is -27°C, humidity is 40%, wind is 2m/s
Response: false
</example>

<example>
Prediction Statement: It will be sunny tomorrow in New York
Actual Weather: It is currently sunny in New York with 20°C, humidity is 60%, and wind is 5m/s
Response: true
</example>

Prediction Statement: {{statement}}
Actual Weather: {{weather_data}}
Response:
`;
