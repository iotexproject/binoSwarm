import {
    SqliteDatabaseAdapter,
    loadVecExtensions,
} from "@elizaos/adapter-sqlite";
import { DatabaseAdapter } from "../database.ts";
import { getEndpoint } from "../models.ts";
import { AgentRuntime } from "../runtime.ts";
import { Action, Evaluator, ModelProviderName, Provider } from "../types.ts";
import { zeroUuid } from "./constants.ts";
import { User } from "./types.ts";

/**
 * Creates a runtime environment for the agent.
 *
 * @param {Object} param - The parameters for creating the runtime.
 * @param {Record<string, string> | NodeJS.ProcessEnv} [param.env] - The environment variables.
 * @param {number} [param.conversationLength] - The length of the conversation.
 * @param {Evaluator[]} [param.evaluators] - The evaluators to be used.
 * @param {Action[]} [param.actions] - The actions to be used.
 * @param {Provider[]} [param.providers] - The providers to be used.
 * @returns {Object} An object containing the created user, session, and runtime.
 */
export async function createRuntime({
    env,
    conversationLength,
    evaluators = [],
    actions = [],
    providers = [],
}: {
    env?: Record<string, string> | NodeJS.ProcessEnv;
    conversationLength?: number;
    evaluators?: Evaluator[];
    actions?: Action[];
    providers?: Provider[];
}) {
    let adapter: DatabaseAdapter;
    let user: User;
    let session: {
        user: User;
    };

    switch (env?.TEST_DATABASE_CLIENT as string) {
        case "sqlite":
        default:
            {
                const module = await import("better-sqlite3");

                const Database = module.default;

                // SQLite adapter
                adapter = new SqliteDatabaseAdapter(new Database(":memory:"));

                // Load sqlite-vss
                await loadVecExtensions((adapter as SqliteDatabaseAdapter).db);
                // Create a test user and session
                session = {
                    user: {
                        id: zeroUuid,
                        email: "test@example.com",
                    },
                };
            }
            break;
    }

    const runtime = new AgentRuntime({
        serverUrl: getEndpoint(ModelProviderName.OPENAI),
        conversationLength,
        token: env!.OPENAI_API_KEY!,
        modelProvider: ModelProviderName.OPENAI,
        actions: actions ?? [],
        evaluators: evaluators ?? [],
        providers: providers ?? [],
        databaseAdapter: adapter,
    });

    return { user, session, runtime };
}
