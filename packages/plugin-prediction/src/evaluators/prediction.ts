import { Evaluator, IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";

export const predictionEvaluator: Evaluator = {
    name: "EVALUATE_PREDICTION",
    similes: [
        "EVALUATE_PREDICTIONS",
        "EVALUATE_PREDICTION_REPORT",
        "EVALUATE_PREDICTION_UPDATE",
        "EVALUATE_PREDICTION_STATUS",
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    description: "Analyze the conversation and create a prediction",
    handler: async (_runtime: IAgentRuntime) => {
        elizaLogger.log("Updating prediction");
        return true;
    },
    examples: [
        {
            context: `Actors in the scene:
  {{user1}}: A prediction market participant
  {{user2}}: Another market participant

  Predictions:
  - Event: Weather Prediction Market
    id: pred-001
    Contract: 0x1234...abcd
    Stakes:
      - Sunny: 150 IOTX
      - Not Sunny: 100 IOTX
    Status: ACTIVE
    Deadline: 2024-03-20`,

            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "The weather data for tomorrow shows 100% chance of rain. We should resolve this prediction.",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Can you verify the source of the weather data?",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "Here's the official weather service report showing the forecast.",
                    },
                },
            ],

            outcome: `{
          "id": "pred-001",
          "contract": "0x1234...abcd",
          "outcome": "NOT_SUNNY",
          "totalPayout": 250,
          "status": "RESOLVED",
          "dataSource": "National Weather Service"
        }`,
        },

        {
            context: `Actors in the scene:
  {{user1}}: A crypto market predictor
  {{user2}}: A market validator

  Predictions:
  - Event: Bitcoin Price Prediction
    id: pred-002
    Contract: 0x5678...efgh
    Stakes:
      - Above 100k: 500 IOTX
      - Below 100k: 300 IOTX
    Status: ACTIVE
    Deadline: 2024-12-31`,

            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "Bitcoin just crashed to 30k, there's no way it'll reach 100k this year. Can we close this prediction early?",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "The market rules don't allow early resolution. We need to wait for the deadline.",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "You're right, let's keep it open until the deadline.",
                    },
                },
            ],

            outcome: `{
          "id": "pred-002",
          "contract": "0x5678...efgh",
          "status": "ACTIVE",
          "message": "Prediction must remain active until deadline"
        }`,
        },

        {
            context: `Actors in the scene:
  {{user1}}: A sports bettor
  {{user2}}: A prediction market oracle

  Predictions:
  - Event: Lakers Game Outcome
    id: pred-003
    Contract: 0x9012...ijkl
    Stakes:
      - Lakers Win: 200 IOTX
      - Lakers Lose: 200 IOTX
    Status: ACTIVE
    Deadline: 2024-03-15`,

            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "The game was cancelled due to unforeseen circumstances.",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Let me verify this information.",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "Here's the official NBA announcement of the cancellation.",
                    },
                },
            ],

            outcome: `{
          "id": "pred-003",
          "contract": "0x9012...ijkl",
          "status": "VOIDED",
          "refundAmount": 400,
          "reason": "Event cancelled - all stakes returned"
        }`,
        },
    ],
};
