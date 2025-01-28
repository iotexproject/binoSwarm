import {
    IAgentRuntime,
    Service,
    ServiceType,
    elizaLogger,
    Prediction,
    generateText,
    ModelClass,
    parseBooleanFromText,
} from "@elizaos/core";

import { resolvePrediction } from "../helpers/blockchain";
import { askQuickSilver } from "../services/quicksilver";

const INTERVAL = 15 * 1000; // 15 seconds in milliseconds

export class PredictionResolver extends Service {
    interval: NodeJS.Timeout;
    runtime: IAgentRuntime;

    static serviceType = ServiceType.PREDICTION_RESOLVER;

    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.runtime = runtime;

        if (!process.env.BINARY_PREDICTION_CONTRACT_ADDRESS) {
            elizaLogger.error(
                "BINARY_PREDICTION_CONTRACT_ADDRESS is not set in the environment"
            );
            return;
        }

        const network = process.env.PREDICTION_NETWORK;
        if (network !== "iotexTestnet" && network !== "iotex") {
            throw new Error("Invalid network");
        }

        // start a loop that runs every x seconds
        this.interval = setInterval(async () => {
            elizaLogger.debug("running prediction resolver...");
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
                elizaLogger.debug(outcome);
                const hash = await resolvePrediction(
                    this.runtime,
                    Number(prediction.smartcontract_id),
                    outcome,
                    network
                );

                if (hash) {
                    await runtime.databaseAdapter.resolvePrediction(
                        prediction.id,
                        outcome
                    );
                }
            });
        }, INTERVAL);
    }
}

export default PredictionResolver;

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
