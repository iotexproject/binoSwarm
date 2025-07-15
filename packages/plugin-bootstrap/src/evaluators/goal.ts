import { z } from "zod";
import { composeContext, generateObject } from "@elizaos/core";
import { getGoals } from "@elizaos/core";
import {
    IAgentRuntime,
    Memory,
    ModelClass,
    Objective,
    type Goal,
    type State,
    Evaluator,
} from "@elizaos/core";
import { goalsTemplate } from "../templates";

async function handler(
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: { [key: string]: unknown } = { onlyInProgress: true }
): Promise<Goal[]> {
    let goalsData = await getGoals({
        runtime,
        roomId: message.roomId,
        onlyInProgress: options.onlyInProgress as boolean,
    });

    state = (await runtime.composeState(message)) as State;
    const context = composeContext({
        state,
        template: runtime.character.templates?.goalsTemplate || goalsTemplate,
    });

    const updatesSchema = z.object({
        updates: z.array(
            z.object({
                id: z.string().describe("The id of the goal"),
                status: z
                    .enum(["IN_PROGRESS", "DONE", "FAILED"])
                    .optional()
                    .describe("The status of the goal"),
                objectives: z
                    .array(
                        z.object({
                            description: z
                                .string()
                                .describe("The description of the objective"),
                            completed: z
                                .boolean()
                                .describe(
                                    "Whether the objective has been completed"
                                ),
                        })
                    )
                    .optional()
                    .describe("The objectives of the goal"),
            })
        ),
    });

    type Updates = z.infer<typeof updatesSchema>;

    const updatesRes = await generateObject<Updates>({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
        schema: updatesSchema,
        schemaName: "updates",
        schemaDescription: "The updates to the goals",
        customSystemPrompt:
            "You are a neutral processing agent. Wait for task-specific instructions in the user prompt.",
        message,
        functionId: "UPDATE_GOAL",
        tags: ["evaluator", "update-goal"],
    });

    const updates = updatesRes.object?.updates || [];

    goalsData = await getGoals({
        runtime,
        roomId: message.roomId,
        onlyInProgress: true,
    });

    const updatedGoals = [];
    const newGoals = [];

    for (const update of updates || []) {
        const existingGoal = goalsData.find(
            (goal: Goal) => goal.id === update.id
        );

        if (existingGoal) {
            const objectives = existingGoal.objectives;

            if (update.objectives) {
                for (const objective of objectives) {
                    const updatedObjective = update.objectives.find(
                        (o: Objective) =>
                            o.description === objective.description
                    );
                    if (updatedObjective) {
                        objective.completed = updatedObjective.completed;
                    }
                }
            }

            updatedGoals.push({
                ...existingGoal,
                ...update,
                objectives: [
                    ...existingGoal.objectives,
                    ...(update.objectives || []),
                ],
            });
        } else {
            newGoals.push({
                ...update,
                userId: message.userId,
                roomId: message.roomId,
                createdAt: new Date().toISOString(),
            });
        }
    }

    for (const _outerGoal of updatedGoals) {
        for (const goal of updatedGoals) {
            const id = goal.id;
            if (goal.id) delete goal.id;
            await runtime.databaseAdapter.updateGoal({ ...goal, id });
        }

        for (const newGoal of newGoals) {
            if (newGoal.id) delete newGoal.id;
            await runtime.databaseAdapter.createGoal(newGoal);
        }

        return [...updatedGoals, ...newGoals];
    }
}

export const goalEvaluator: Evaluator = {
    name: "UPDATE_GOAL",
    similes: [
        "UPDATE_GOALS",
        "EDIT_GOAL",
        "UPDATE_GOAL_STATUS",
        "UPDATE_OBJECTIVES",
    ],
    validate: async (
        _runtime: IAgentRuntime,
        _message: Memory
    ): Promise<boolean> => {
        return true;
    },
    description:
        "Analyze the conversation and update the status of the goals based on the new information provided.",
    handler,
    examples: [
        {
            context: `Actors in the scene:
  {{user1}}: An avid reader and member of a book club.
  {{user2}}: The organizer of the book club.

  Goals:
  - Name: Finish reading "War and Peace"
    id: 12345-67890-12345-67890
    Status: IN_PROGRESS
    Objectives:
      - Read up to chapter 20 by the end of the month
      - Discuss the first part in the next meeting`,

            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "I've just finished chapter 20 of 'War and Peace'",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Were you able to grasp the complexities of the characters",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "Yep. I've prepared some notes for our discussion",
                    },
                },
            ],

            outcome: `[
        {
          "id": "12345-67890-12345-67890",
          "status": "DONE",
          "objectives": [
            { "description": "Read up to chapter 20 by the end of the month", "completed": true },
            { "description": "Prepare notes for the next discussion", "completed": true }
          ]
        }
      ]`,
        },

        {
            context: `Actors in the scene:
  {{user1}}: A fitness enthusiast working towards a marathon.
  {{user2}}: A personal trainer.

  Goals:
  - Name: Complete a marathon
    id: 23456-78901-23456-78901
    Status: IN_PROGRESS
    Objectives:
      - Increase running distance to 30 miles a week
      - Complete a half-marathon as practice`,

            messages: [
                {
                    user: "{{user1}}",
                    content: { text: "I managed to run 30 miles this week" },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Impressive progress! How do you feel about the half-marathon next month?",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "I feel confident. The training is paying off.",
                    },
                },
            ],

            outcome: `[
        {
          "id": "23456-78901-23456-78901",
          "objectives": [
            { "description": "Increase running distance to 30 miles a week", "completed": true },
            { "description": "Complete a half-marathon as practice", "completed": false }
          ]
        }
      ]`,
        },

        {
            context: `Actors in the scene:
  {{user1}}: A student working on a final year project.
  {{user2}}: The project supervisor.

  Goals:
  - Name: Finish the final year project
    id: 34567-89012-34567-89012
    Status: IN_PROGRESS
    Objectives:
      - Submit the first draft of the thesis
      - Complete the project prototype`,

            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "I've submitted the first draft of my thesis.",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "Well done. How is the prototype coming along?",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "It's almost done. I just need to finalize the testing phase.",
                    },
                },
            ],

            outcome: `[
        {
          "id": "34567-89012-34567-89012",
          "objectives": [
            { "description": "Submit the first draft of the thesis", "completed": true },
            { "description": "Complete the project prototype", "completed": false }
          ]
        }
      ]`,
        },

        {
            context: `Actors in the scene:
        {{user1}}: A project manager working on a software development project.
        {{user2}}: A software developer in the project team.

        Goals:
        - Name: Launch the new software version
          id: 45678-90123-45678-90123
          Status: IN_PROGRESS
          Objectives:
            - Complete the coding for the new features
            - Perform comprehensive testing of the software`,

            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "How's the progress on the new features?",
                    },
                },
                {
                    user: "{{user2}}",
                    content: {
                        text: "We've encountered some unexpected challenges and are currently troubleshooting.",
                    },
                },
                {
                    user: "{{user1}}",
                    content: {
                        text: "Let's move on and cancel the task.",
                    },
                },
            ],

            outcome: `[
        {
          "id": "45678-90123-45678-90123",
          "status": "FAILED"
      ]`,
        },
    ],
};
