import { names, uniqueNamesGenerator } from "unique-names-generator";
import { v4 as uuidv4 } from "uuid";
import {
    composeActionExamples,
    formatActionNames,
    formatActions,
} from "./actions.ts";
import { addHeader, composeContext } from "./context.ts";
import { defaultCharacter } from "./defaultCharacter.ts";
import {
    evaluationTemplate,
    formatEvaluatorExamples,
    formatEvaluatorNames,
    formatEvaluators,
} from "./evaluators.ts";
import { generateObject } from "./generation.ts";
import { formatGoalsAsString, getGoals } from "./goals.ts";
import { elizaLogger } from "./index.ts";
import { MemoryManager } from "./memory.ts";
import { formatMessages, retrieveActorIdsFromMessages } from "./messages.ts";
import { stringArraySchema } from "./parsing.ts";
import { formatPosts } from "./posts.ts";
import { getProviders } from "./providers.ts";
import { RAGKnowledgeManager } from "./ragknowledge.ts";
import settings from "./settings.ts";
import {
    Character,
    HandlerCallback,
    IAgentRuntime,
    ICacheManager,
    IDatabaseAdapter,
    IMemoryManager,
    IRAGKnowledgeManager,
    IVerifiableInferenceAdapter,
    KnowledgeItem,
    Media,
    ModelClass,
    ModelProviderName,
    Plugin,
    Provider,
    Service,
    ServiceType,
    State,
    UUID,
    type Action,
    type Actor,
    type Evaluator,
    type Memory,
} from "./types.ts";
import { stringToUuid } from "./uuid.ts";

const POST_EXAMPLES_COUNT = 20;
const MESSAGE_EXAMPLES_COUNT = 5;
const TOPICS_COUNT = 5;
const LORE_COUNT = 3;

type AgentRuntimeOptions = {
    conversationLength?: number;
    agentId?: UUID;
    character?: Character;
    token: string; // JWT token, can be a JWT token if outside worker, or an OpenAI token if inside worker
    serverUrl?: string; // The URL of the worker
    actions?: Action[];
    evaluators?: Evaluator[];
    plugins?: Plugin[];
    providers?: Provider[];
    modelProvider: ModelProviderName;
    services?: Service[];
    managers?: IMemoryManager[];
    databaseAdapter: IDatabaseAdapter;
    fetch?: typeof fetch | unknown;
    speechModelPath?: string;
    cacheManager: ICacheManager;
    logging?: boolean;
    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
};

export class AgentRuntime implements IAgentRuntime {
    /**
     * Default count for recent messages to be kept in memory.
     * @private
     */
    readonly #conversationLength = 32 as number;
    agentId: UUID;
    serverUrl = "http://localhost:7998"; // Do we need this?
    databaseAdapter: IDatabaseAdapter;
    token: string | null;
    actions: Action[] = [];
    evaluators: Evaluator[] = [];
    providers: Provider[] = [];
    plugins: Plugin[] = [];
    modelProvider: ModelProviderName;
    imageModelProvider: ModelProviderName;
    imageVisionModelProvider: ModelProviderName;
    fetch = fetch;
    character: Character;
    messageManager: IMemoryManager;
    descriptionManager: IMemoryManager;
    loreManager: IMemoryManager;
    documentsManager: IMemoryManager;
    ragKnowledgeManager: IRAGKnowledgeManager;
    services: Map<ServiceType, Service> = new Map();
    memoryManagers: Map<string, IMemoryManager> = new Map();
    cacheManager: ICacheManager;
    clients: Record<string, any>;

    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;

    constructor(opts: AgentRuntimeOptions) {
        if (opts.conversationLength) {
            this.#conversationLength = opts.conversationLength;
        }
        this.initAgent(opts);
        this.initFetch(opts);
        this.registerMemoryManagers(opts);
        this.registerCustomServices(opts);
        this.initServerUrl(opts);

        this.initModelProvider(opts);
        this.initImageModelProvider();
        this.initImageVisionModelProvider();
        this.validateModelProvider();

        this.initPlugins(opts);

        this.registerActions(opts);
        this.registerContextProviders(opts);
        this.registerEvaluators(opts);
    }

    async initialize() {
        await this.initializeServices();
        await this.initializePluginServices();
        await this.initCharacterKnowledge();
    }

    registerMemoryManager(manager: IMemoryManager): void {
        if (!manager.tableName) {
            throw new Error("Memory manager must have a tableName");
        }

        if (this.memoryManagers.has(manager.tableName)) {
            elizaLogger.warn(
                `Memory manager ${manager.tableName} is already registered. Skipping registration.`
            );
            return;
        }

        this.memoryManagers.set(manager.tableName, manager);
    }

    getMemoryManager(tableName: string): IMemoryManager | null {
        return this.memoryManagers.get(tableName) || null;
    }

    getService<T extends Service>(service: ServiceType): T | null {
        const serviceInstance = this.services.get(service);
        if (!serviceInstance) {
            elizaLogger.error(`Service ${service} not found`);
            return null;
        }
        return serviceInstance as T;
    }

    getVerifiableInferenceAdapter(): IVerifiableInferenceAdapter | undefined {
        return this.verifiableInferenceAdapter;
    }

    setVerifiableInferenceAdapter(adapter: IVerifiableInferenceAdapter): void {
        this.verifiableInferenceAdapter = adapter;
    }

    getSetting(key: string) {
        // check if the key is in the character.settings.secrets object
        if (this.character.settings?.secrets?.[key]) {
            return this.character.settings.secrets[key];
        }
        // if not, check if it's in the settings object
        if (this.character.settings?.[key]) {
            return this.character.settings[key];
        }

        // if not, check if it's in the settings object
        if (settings[key]) {
            return settings[key];
        }

        return null;
    }

    getConversationLength() {
        return this.#conversationLength;
    }

    registerAction(action: Action) {
        elizaLogger.success(`Registering action: ${action.name}`);
        this.actions.push(action);
    }

    registerEvaluator(evaluator: Evaluator) {
        this.evaluators.push(evaluator);
    }

    registerContextProvider(provider: Provider) {
        this.providers.push(provider);
    }

    async stop() {
        elizaLogger.debug("runtime::stop - character", this.character);
        this.stopClients();
    }

    async registerService(service: Service): Promise<void> {
        const serviceType = service.serviceType;
        elizaLogger.log("Registering service:", serviceType);

        if (this.services.has(serviceType)) {
            elizaLogger.warn(
                `Service ${serviceType} is already registered. Skipping registration.`
            );
            return;
        }

        // Add the service to the services map
        this.services.set(serviceType, service);
        elizaLogger.success(`Service ${serviceType} registered successfully`);
    }

    async updateRecentMessageState(state: State): Promise<State> {
        const conversationLength = this.getConversationLength();
        const recentMessagesData = await this.messageManager.getMemories({
            roomId: state.roomId,
            count: conversationLength,
            unique: false,
        });

        const recentMessages = formatMessages({
            actors: state.actorsData ?? [],
            messages: recentMessagesData,
        });

        let allAttachments = [];

        if (recentMessagesData && Array.isArray(recentMessagesData)) {
            const lastMessageWithAttachment = recentMessagesData.find(
                (msg) =>
                    msg.content.attachments &&
                    msg.content.attachments.length > 0
            );

            if (lastMessageWithAttachment) {
                const lastMessageTime =
                    lastMessageWithAttachment?.createdAt ?? Date.now();
                const oneHourBeforeLastMessage =
                    lastMessageTime - 60 * 60 * 1000; // 1 hour before last message

                allAttachments = recentMessagesData
                    .filter((msg) => {
                        const msgTime = msg.createdAt ?? Date.now();
                        return msgTime >= oneHourBeforeLastMessage;
                    })
                    .flatMap((msg) => msg.content.attachments || []);
            }
        }

        const formattedAttachments = allAttachments
            .map(
                (attachment) =>
                    `ID: ${attachment.id}
Name: ${attachment.title}
URL: ${attachment.url}
Type: ${attachment.source}
Description: ${attachment.description}
Text: ${attachment.text}
    `
            )
            .join("\n");

        return {
            ...state,
            recentMessages: addHeader(
                "# Conversation Messages",
                recentMessages
            ),
            recentMessagesData,
            attachments: formattedAttachments,
        } as State;
    }

    async processActions(
        message: Memory,
        responses: Memory[],
        state?: State,
        callback?: HandlerCallback
    ): Promise<void> {
        for (const response of responses) {
            if (!response.content?.action) {
                elizaLogger.warn("No action found in the response content.");
                continue;
            }

            const action = this.findAction(response.content.action);

            if (!action) {
                elizaLogger.error(
                    "No action found for",
                    response.content.action
                );
                continue;
            }

            if (!action.handler) {
                elizaLogger.error(`Action ${action.name} has no handler.`);
                continue;
            }

            try {
                elizaLogger.info(
                    `Executing handler for action: ${action.name}`
                );
                await action.handler(this, message, state, {}, callback);
            } catch (error) {
                elizaLogger.error(error);
            }
        }
    }

    async evaluate(
        message: Memory,
        state: State,
        didRespond?: boolean,
        callback?: HandlerCallback
    ) {
        const evaluatorPromises = this.getEvaluatorPromises(
            message,
            state,
            didRespond
        );
        const resolvedEvaluators = await Promise.all(evaluatorPromises);

        const evaluatorsData = resolvedEvaluators.filter(
            (evaluator): evaluator is Evaluator => evaluator !== null
        );
        if (!evaluatorsData || evaluatorsData.length === 0) {
            return [];
        }

        const evaluators = await this.generateRequiredEvaluators(
            state,
            evaluatorsData
        );

        for (const evaluator of this.evaluators) {
            if (!evaluators?.includes(evaluator.name)) continue;

            if (evaluator.handler)
                await evaluator.handler(this, message, state, {}, callback);
        }

        return evaluators;
    }

    async ensureParticipantExists(userId: UUID, roomId: UUID) {
        const participants =
            await this.databaseAdapter.getParticipantsForAccount(userId);

        if (participants?.length === 0) {
            await this.databaseAdapter.addParticipant(userId, roomId);
        }
    }

    async ensureUserExists(
        userId: UUID,
        userName: string | null,
        name: string | null,
        email?: string | null,
        source?: string | null
    ) {
        const account = await this.databaseAdapter.getAccountById(userId);
        if (!account) {
            await this.databaseAdapter.createAccount({
                id: userId,
                name: name || userName || "Unknown User",
                username: userName || name || "Unknown",
                email: email || (userName || "Bot") + "@" + source || "Unknown", // Temporary
                details: { summary: "" },
            });
            elizaLogger.success(`User ${userName} created successfully.`);
        }
    }

    async ensureParticipantInRoom(userId: UUID, roomId: UUID) {
        const isUserInTheRoom = await this.databaseAdapter.getIsUserInTheRoom(
            roomId,
            userId
        );
        if (isUserInTheRoom) {
            return;
        }
        await this.databaseAdapter.addParticipant(userId, roomId);
        if (userId === this.agentId) {
            elizaLogger.log(
                `Agent ${this.character.name} linked to room ${roomId} successfully.`
            );
        } else {
            elizaLogger.log(
                `User ${userId} linked to room ${roomId} successfully.`
            );
        }
    }

    async ensureConnection(
        userId: UUID,
        roomId: UUID,
        userName?: string,
        userScreenName?: string,
        source?: string
    ) {
        await Promise.all([
            this.ensureUserExists(
                this.agentId,
                this.character.name ?? "Agent",
                this.character.name ?? "Agent",
                source
            ),
            this.ensureUserExists(
                userId,
                userName ?? "User" + userId,
                userScreenName ?? "User" + userId,
                source
            ),
            this.ensureRoomExists(roomId),
        ]);

        await Promise.all([
            this.ensureParticipantInRoom(userId, roomId),
            this.ensureParticipantInRoom(this.agentId, roomId),
        ]);
    }

    async ensureRoomExists(roomId: UUID) {
        const room = await this.databaseAdapter.getRoom(roomId);
        if (!room) {
            await this.databaseAdapter.createRoom(roomId);
            elizaLogger.log(`Room ${roomId} created successfully.`);
        }
    }

    async composeState(
        message: Memory,
        additionalKeys: { [key: string]: unknown } = {},
        fastMode: boolean = false
    ) {
        const { userId, roomId } = message;

        // RETRIEVING
        const retrievingStart = Date.now();
        const [
            goalsRes,
            knowledgeRes,
            recentInteractionsData,
            messagesAndActorsRes,
        ] = await Promise.all([
            this.getAndFormatGoals(roomId, userId),
            this.getAndFormatKnowledge(fastMode, message),
            this.getRecentInteractions(userId, this.agentId, roomId),
            this.getMssgsAndActors(roomId),
        ]);
        const retrievingTime = Date.now() - retrievingStart;
        elizaLogger.info(`Retrieving took ${retrievingTime}ms`);
        // FORMATTING
        const recentPostInteractions = this.getRecentPostInteractions(
            recentInteractionsData,
            messagesAndActorsRes.actorsData
        );
        const recentMessageInteractions = this.getRecentMessageInteractions(
            recentInteractionsData,
            messagesAndActorsRes.actorsData,
            userId
        );

        const recentMessages = formatMessages({
            messages: messagesAndActorsRes.recentMessagesData,
            actors: messagesAndActorsRes.actorsData,
        });
        const recentPosts = formatPosts({
            messages: messagesAndActorsRes.recentMessagesData,
            actors: messagesAndActorsRes.actorsData,
            conversationHeader: false,
        });
        const formattedAttachments = this.collectAndFormatAttachments(
            message,
            messagesAndActorsRes.recentMessagesData
        );
        const characterPostExamples = formatPostExamples(
            this,
            this.character.postExamples
        );
        const characterMessageExamples = formatMessageExamples(
            this,
            this.character.messageExamples
        );

        const initialState = {
            agentId: this.agentId,
            agentName: this.extractAgentName(messagesAndActorsRes.actorsData),
            bio: this.buildBio(),
            system: this.character.system,
            lore: this.buildLore(),
            adjective: this.buildAdjectives(),
            knowledge: knowledgeRes.formattedKnowledge,
            knowledgeData: knowledgeRes.knowledgeData,
            ragKnowledgeData: knowledgeRes.knowledgeData,
            topic: this.buildTopic(),
            topics: this.buildTopics(),
            messageDirections: this.buildMessageDirections(),
            postDirections: this.buildPostDirections(),
            senderName: this.extractSenderName(
                messagesAndActorsRes.actorsData,
                userId
            ),
            actors: "", // TODO: Can be removed once we verify that this is not used anywhere
            actorsData: messagesAndActorsRes.actorsData,
            roomId,
            goals: this.buildGoals(goalsRes.goals),
            goalsData: goalsRes.goalsData,
            recentMessages: this.buildRecentMessages(recentMessages),
            recentPosts: this.buildRecentPosts(recentPosts),
            recentMessagesData: messagesAndActorsRes.recentMessagesData,
            attachments: this.buildAttachments(formattedAttachments),
            recentMessageInteractions,
            recentPostInteractions,
            recentInteractionsData,
            characterPostExamples,
            characterMessageExamples,
            ...additionalKeys,
        } as State;

        const actionStateStart = Date.now();
        const actionState = await this.buildActionState(
            message,
            initialState,
            fastMode
        );
        const actionStateTime = Date.now() - actionStateStart;
        elizaLogger.info(`Action state took ${actionStateTime}ms`);
        return { ...initialState, ...actionState } as State;
    }

    private registerEvaluators(opts: AgentRuntimeOptions) {
        (opts.evaluators ?? []).forEach((evaluator: Evaluator) => {
            this.registerEvaluator(evaluator);
        });
    }

    private registerContextProviders(opts: AgentRuntimeOptions) {
        (opts.providers ?? []).forEach((provider) => {
            this.registerContextProvider(provider);
        });
    }

    private registerActions(opts: AgentRuntimeOptions) {
        (opts.actions ?? []).forEach((action) => {
            this.registerAction(action);
        });
    }

    private initPlugins(opts: AgentRuntimeOptions) {
        this.plugins = [
            ...(opts.character?.plugins ?? []),
            ...(opts.plugins ?? []),
        ];

        this.plugins.forEach((plugin) => {
            plugin.actions?.forEach((action) => {
                this.registerAction(action);
            });

            plugin.evaluators?.forEach((evaluator) => {
                this.registerEvaluator(evaluator);
            });

            plugin.services?.forEach((service) => {
                this.registerService(service);
            });

            plugin.providers?.forEach((provider) => {
                this.registerContextProvider(provider);
            });
        });
    }

    private initServerUrl(opts: AgentRuntimeOptions) {
        this.serverUrl = opts.serverUrl ?? this.serverUrl;
        if (!this.serverUrl) {
            elizaLogger.warn("No serverUrl provided, defaulting to localhost");
        }
    }

    private validateModelProvider() {
        if (!Object.values(ModelProviderName).includes(this.modelProvider)) {
            elizaLogger.error("Invalid model provider:", this.modelProvider);
            elizaLogger.error(
                "Available providers:",
                Object.values(ModelProviderName)
            );
            throw new Error(`Invalid model provider: ${this.modelProvider}`);
        }
    }

    private initImageVisionModelProvider() {
        if (this.character.imageVisionModelProvider) {
            this.imageVisionModelProvider =
                this.character.imageVisionModelProvider;
        } else {
            this.imageVisionModelProvider = this.modelProvider;
        }

        elizaLogger.info(
            "Selected IMAGE VISION model provider:",
            this.imageVisionModelProvider
        );
    }

    private initImageModelProvider() {
        if (this.character.imageModelProvider) {
            this.imageModelProvider = this.character.imageModelProvider;
        } else {
            this.imageModelProvider = this.modelProvider;
        }

        elizaLogger.info(
            "Selected IMAGE model provider:",
            this.imageModelProvider
        );
    }

    private initModelProvider(opts: AgentRuntimeOptions) {
        elizaLogger.info("Setting model provider...");
        elizaLogger.info("Model Provider Selection:", {
            characterModelProvider: this.character.modelProvider,
            optsModelProvider: opts.modelProvider,
            currentModelProvider: this.modelProvider,
            finalSelection:
                this.character.modelProvider ??
                opts.modelProvider ??
                this.modelProvider,
        });

        if (this.character.modelProvider) {
            this.modelProvider = this.character.modelProvider;
        } else if (opts.modelProvider) {
            this.modelProvider = opts.modelProvider;
        }

        elizaLogger.info("Selected model provider:", this.modelProvider);
    }

    private registerMemoryManagers(opts: AgentRuntimeOptions) {
        this.cacheManager = opts.cacheManager;

        this.messageManager = new MemoryManager({
            runtime: this,
            tableName: "messages",
        });

        this.descriptionManager = new MemoryManager({
            runtime: this,
            tableName: "descriptions",
        });

        this.loreManager = new MemoryManager({
            runtime: this,
            tableName: "lore",
        });

        this.documentsManager = new MemoryManager({
            runtime: this,
            tableName: "documents",
        });

        // this.knowledgeManager = new MemoryManager({
        //     runtime: this,
        //     tableName: "fragments",
        // });

        this.ragKnowledgeManager = new RAGKnowledgeManager({
            runtime: this,
        });

        (opts.managers ?? []).forEach((manager: IMemoryManager) => {
            this.registerMemoryManager(manager);
        });
    }

    private initAgent(opts: AgentRuntimeOptions) {
        if (!opts.databaseAdapter) {
            throw new Error("No database adapter provided");
        }

        elizaLogger.info("Initializing AgentRuntime with options:", {
            character: opts.character?.name,
            modelProvider: opts.modelProvider,
            characterModelProvider: opts.character?.modelProvider,
        });

        this.databaseAdapter = opts.databaseAdapter;
        this.character = opts.character || defaultCharacter;
        this.token = opts.token;

        this.initAgentId(opts);
        this.ensureRoomExists(this.agentId);
        this.ensureUserExists(
            this.agentId,
            this.character.name,
            this.character.name
        ).then(() => {
            // postgres needs the user to exist before you can add a participant
            this.ensureParticipantExists(this.agentId, this.agentId);
        });

        elizaLogger.success(`Agent ID: ${this.agentId}`);
    }

    private registerCustomServices(opts: AgentRuntimeOptions) {
        (opts.services ?? []).forEach((service: Service) => {
            this.registerService(service);
        });
    }

    private initFetch(opts: AgentRuntimeOptions) {
        this.fetch = (opts.fetch as typeof fetch) ?? this.fetch;
    }

    private initAgentId(opts: AgentRuntimeOptions) {
        // use the character id if it exists, otherwise use the agentId if it is passed in, otherwise use the character name
        if (opts.character?.id) {
            this.agentId = opts.character.id;
        } else if (opts.agentId) {
            this.agentId = opts.agentId;
        } else {
            this.agentId = stringToUuid(opts.character?.name ?? uuidv4());
        }
    }

    private async initCharacterKnowledge() {
        if (!this.character?.knowledge?.length) {
            return;
        }

        await this.ragKnowledgeManager.processCharacterRAGKnowledge(
            this.character.knowledge
        );
    }

    private async initializePluginServices() {
        for (const plugin of this.plugins) {
            if (plugin.services)
                await Promise.all(
                    plugin.services?.map((service) => service.initialize(this))
                );
        }
    }

    private async initializeServices() {
        for (const [serviceType, service] of this.services.entries()) {
            try {
                await service.initialize(this);
                this.services.set(serviceType, service);
                elizaLogger.success(
                    `Service ${serviceType} initialized successfully`
                );
            } catch (error) {
                elizaLogger.error(
                    `Failed to initialize service ${serviceType}:`,
                    error
                );
                throw error;
            }
        }
    }

    private stopClients() {
        for (const clientString in this.clients) {
            const client = this.clients[clientString];
            elizaLogger.log(
                "runtime::stop - requesting",
                clientString,
                "client stop for",
                this.character.name
            );
            client.stop();
        }
    }

    private findAction(contentAction: string) {
        const normalizedAction = contentAction.toLowerCase().replace("_", "");

        elizaLogger.success(`Normalized action: ${normalizedAction}`);

        let action = this.actions.find((a: { name: string }) => {
            const lowerCaseName = a.name.toLowerCase().replace("_", "");
            return (
                lowerCaseName.includes(normalizedAction) ||
                normalizedAction.includes(lowerCaseName)
            );
        });

        if (!action) {
            elizaLogger.info("Attempting to find action in similes.");
            for (const actionFromSimiles of this.actions) {
                const simileAction = actionFromSimiles.similes.find(
                    (simile) => {
                        const lowerCaseSimile = simile
                            .toLowerCase()
                            .replace("_", "");
                        return (
                            lowerCaseSimile.includes(normalizedAction) ||
                            normalizedAction.includes(lowerCaseSimile)
                        );
                    }
                );
                if (simileAction) {
                    action = actionFromSimiles;
                    elizaLogger.success(
                        `Action found in similes: ${action.name}`
                    );
                    break;
                }
            }
        }

        return action;
    }

    private async generateRequiredEvaluators(
        state: State,
        evaluatorsData: Evaluator[]
    ) {
        const context = composeContext({
            state: {
                ...state,
                evaluators: formatEvaluators(evaluatorsData),
                evaluatorNames: formatEvaluatorNames(evaluatorsData),
            },
            template:
                this.character.templates?.evaluationTemplate ||
                evaluationTemplate,
        });

        const result = await generateObject<{ values: string[] }>({
            runtime: this,
            context,
            modelClass: ModelClass.SMALL,
            schema: stringArraySchema,
            schemaName: "evaluatorNames",
            schemaDescription: "The names of the evaluators",
        });

        const evaluators = result.object?.values || [];

        return evaluators;
    }

    private getEvaluatorPromises(
        message: Memory,
        state: State,
        didRespond?: boolean
    ) {
        return this.evaluators.map(async (evaluator: Evaluator) => {
            elizaLogger.log("Evaluating", evaluator.name);
            if (!evaluator.handler) {
                return null;
            }
            if (!didRespond && !evaluator.alwaysRun) {
                return null;
            }
            const result = await evaluator.validate(this, message, state);
            if (result) {
                return evaluator;
            }
            return null;
        });
    }

    private async buildActionState(
        message: Memory,
        initialState: State,
        fastMode: boolean
    ) {
        const actionPromises = this.getActionValidationPromises(
            message,
            initialState
        );
        const evaluatorPromises = this.getEvaluatorValidationPromises(
            message,
            initialState
        );
        const providersPromise = !fastMode
            ? getProviders(this, message, initialState)
            : "";

        const [resolvedEvaluators, resolvedActions, providers] =
            await Promise.all([
                Promise.all(evaluatorPromises),
                Promise.all(actionPromises),
                providersPromise,
            ]);

        const evaluatorsData = resolvedEvaluators.filter(
            Boolean
        ) as Evaluator[];
        const actionsData = resolvedActions.filter(Boolean) as Action[];

        const actionState = {
            actionNames:
                "Possible response actions: " + formatActionNames(actionsData),
            actions:
                actionsData.length > 0
                    ? addHeader(
                          "# Available Actions",
                          formatActions(actionsData)
                      )
                    : "",
            actionExamples:
                actionsData.length > 0
                    ? addHeader(
                          "# Action Examples",
                          composeActionExamples(actionsData, 10)
                      )
                    : "",
            evaluatorsData,
            evaluators:
                evaluatorsData.length > 0
                    ? formatEvaluators(evaluatorsData)
                    : "",
            evaluatorNames:
                evaluatorsData.length > 0
                    ? formatEvaluatorNames(evaluatorsData)
                    : "",
            evaluatorExamples:
                evaluatorsData.length > 0
                    ? formatEvaluatorExamples(evaluatorsData)
                    : "",
            providers: addHeader(
                `# Additional Information About ${this.character.name} and The World`,
                providers
            ),
        };
        return actionState;
    }

    private getEvaluatorValidationPromises(
        message: Memory,
        initialState: State
    ) {
        return this.evaluators.map(async (evaluator) => {
            const result = await evaluator.validate(
                this,
                message,
                initialState
            );
            if (result) {
                return evaluator;
            }
            return null;
        });
    }

    private getActionValidationPromises(message: Memory, initialState: State) {
        return this.actions.map(async (action: Action) => {
            const result = await action.validate(this, message, initialState);
            if (result) {
                return action;
            }
            return null;
        });
    }

    private buildAttachments(formattedAttachments: string): unknown {
        return formattedAttachments && formattedAttachments.length > 0
            ? addHeader("# Attachments", formattedAttachments)
            : "";
    }

    private buildRecentPosts(recentPosts: string): unknown {
        return recentPosts && recentPosts.length > 0
            ? addHeader("# Posts in Thread", recentPosts)
            : "";
    }

    private buildRecentMessages(recentMessages: string): string {
        return recentMessages && recentMessages.length > 0
            ? addHeader("# Conversation Messages", recentMessages)
            : "";
    }

    private buildGoals(goals: string): string {
        return goals && goals.length > 0
            ? addHeader(
                  "# Goals\n{{agentName}} should prioritize accomplishing the objectives that are in progress.",
                  goals
              )
            : "";
    }

    private buildPostDirections(): string {
        return this.character?.style?.all?.length > 0 ||
            this.character?.style?.post.length > 0
            ? addHeader(
                  "# Post Directions for " + this.character.name,
                  (() => {
                      const all = this.character?.style?.all || [];
                      const post = this.character?.style?.post || [];
                      return formatPostDirections(
                          [...all, ...post],
                          this.getConversationLength() / 2
                      );
                  })()
              )
            : "";
    }

    private buildMessageDirections(): string {
        return this.character?.style?.all?.length > 0 ||
            this.character?.style?.chat.length > 0
            ? addHeader(
                  "# Message Directions for " + this.character.name,
                  (() => {
                      const all = this.character?.style?.all || [];
                      const chat = this.character?.style?.chat || [];
                      return [...all, ...chat].join("\n");
                  })()
              )
            : "";
    }

    private buildTopics(): unknown {
        return this.character.topics?.length > 0
            ? `${this.character.name} is interested in ` +
                  getTopics(this, this.character.topics)
            : "";
    }

    private buildTopic(): unknown {
        return this.character.topics?.length > 0
            ? getRandomElementFromArray(this.character.topics)
            : null;
    }

    private buildAdjectives(): unknown {
        return this.character.adjectives?.length > 0
            ? getRandomElementFromArray(this.character.adjectives)
            : "";
    }

    private async getAndFormatKnowledge(fastMode: boolean, message: Memory) {
        let knowledgeData = [];
        let formattedKnowledge = "";

        if (!fastMode) {
            knowledgeData = await this.ragKnowledgeManager.getKnowledge({
                query: message.content.text,
                limit: 5,
                isUnique: true,
            });

            formattedKnowledge = formatKnowledge(knowledgeData);
        }
        return { formattedKnowledge, knowledgeData };
    }

    private buildBio() {
        let bio = this.character.bio || "";
        if (Array.isArray(bio)) {
            bio = shuffleAndSlice<string>(bio);
        }
        return bio;
    }

    private buildLore() {
        let lore = "";
        if (this.character.lore?.length > 0) {
            const count = this.getSetting("LORE_COUNT") || LORE_COUNT;
            const shuffledLore = shuffleAndSlice<string>(
                this.character.lore,
                Number(count)
            );
            lore = joinLines(shuffledLore);
        }
        return lore;
    }

    private collectAndFormatAttachments(
        message: Memory,
        recentMessagesData: Memory[]
    ) {
        let allAttachments = message.content.attachments || [];

        if (recentMessagesData && Array.isArray(recentMessagesData)) {
            allAttachments = this.collectAndFilterAttachments(
                recentMessagesData,
                allAttachments
            );
        }

        const formattedAttachments = formatAttachments(allAttachments);
        return formattedAttachments;
    }

    private collectAndFilterAttachments(
        recentMessagesData: Memory[],
        allAttachments: Media[]
    ) {
        const lastMessageWithAttachment = recentMessagesData.find(
            (msg) =>
                msg.content.attachments && msg.content.attachments.length > 0
        );

        if (lastMessageWithAttachment) {
            const lastMessageTime =
                lastMessageWithAttachment?.createdAt ?? Date.now();
            const oneHourBeforeLastMessage = lastMessageTime - 60 * 60 * 1000; // 1 hour before last message

            allAttachments = recentMessagesData
                .reverse()
                .map((msg) => {
                    const msgTime = msg.createdAt ?? Date.now();
                    const isWithinTime = msgTime >= oneHourBeforeLastMessage;
                    const attachments = msg.content.attachments || [];
                    if (!isWithinTime) {
                        attachments.forEach((attachment) => {
                            attachment.text = "[Hidden]";
                        });
                    }
                    return attachments;
                })
                .flat();
        }
        return allAttachments;
    }

    private extractAgentName(actorsData: Actor[]) {
        // TODO: We may wish to consolidate and just accept character.name here instead of the actor name
        return (
            actorsData?.find((actor: Actor) => actor.id === this.agentId)
                ?.name || this.character.name
        );
    }

    private extractSenderName(actorsData: Actor[], userId: string) {
        return actorsData?.find((actor: Actor) => actor.id === userId)?.name;
    }

    private async getMssgsAndActors(roomId: UUID) {
        const recentMessagesData = await this.messageManager.getMemories({
            roomId,
            count: this.getConversationLength(),
            unique: false,
        });

        const actorIds = retrieveActorIdsFromMessages(recentMessagesData);
        const actorsData =
            await this.databaseAdapter.getAccountsByIds(actorIds);
        return { recentMessagesData, actorsData };
    }

    private async getAndFormatGoals(roomId: UUID, userId?: UUID) {
        const goalsData = await getGoals({
            runtime: this,
            roomId,
            userId,
        });

        const goals = formatGoalsAsString({ goals: goalsData });
        return { goals, goalsData };
    }

    private async getRecentInteractions(
        userId: UUID,
        agentId: UUID,
        roomId: UUID
    ): Promise<Memory[]> {
        if (userId === agentId) {
            return [];
        }

        // Find all rooms where both user and agent are participants
        const rooms = await this.databaseAdapter.getRoomsForParticipants([
            userId,
            agentId,
        ]);

        // Check the existing memories in the database
        return this.messageManager.getMemoriesByRoomIds({
            // filter out the current room id from rooms
            roomIds: rooms.filter((room) => room !== roomId),
            limit: 20,
            userId,
        });
    }

    private getRecentMessageInteractions(
        recentInteractionsData: Memory[],
        actorsData: Actor[],
        userId: UUID
    ): string {
        const formattedInteractions = recentInteractionsData.map(
            async (message) => {
                const isSelf = message.userId === this.agentId;
                let sender: string;
                if (isSelf) {
                    sender = this.character.name;
                } else {
                    sender =
                        actorsData.find((actor) => actor.id === userId)?.name ||
                        "unknown";
                }
                return `${sender}: ${message.content.text}`;
            }
        );

        return formattedInteractions.join("\n");
    }

    private getRecentPostInteractions(
        recentInteractionsData: Memory[],
        actors: Actor[]
    ): string {
        const formattedInteractions = formatPosts({
            messages: recentInteractionsData,
            actors,
            conversationHeader: true,
        });

        return formattedInteractions;
    }
}

const formatKnowledge = (knowledge: KnowledgeItem[]) => {
    return knowledge
        .map((knowledge) => `- ${knowledge.content.text}`)
        .join("\n");
};

const formatPostExamples = (runtime: AgentRuntime, postExamples: string[]) => {
    const count =
        runtime.getSetting("POST_EXAMPLES_COUNT") || POST_EXAMPLES_COUNT;
    const examples = shuffleAndSlice<string>(postExamples, Number(count));
    const formattedExamples = joinLines(examples);

    if (formattedExamples.length > 0) {
        return addHeader(
            "Example Posts for " + runtime.character.name + ":\n\n",
            formattedExamples
        );
    }
    return "";
};

type MessagesExample = {
    user: string;
    content: {
        text?: string;
        action?: string;
    };
}[];

export const formatMessageExamples = (
    runtime: AgentRuntime,
    messageExamples: MessagesExample[]
) => {
    const count =
        runtime.getSetting("MESSAGE_EXAMPLES_COUNT") || MESSAGE_EXAMPLES_COUNT;
    const examples = shuffleAndSlice<MessagesExample>(
        messageExamples,
        Number(count)
    );
    const withNames = examples.map((example) => buildExample(example));
    const formattedExamples = joinLines(withNames, "\n\n");

    if (formattedExamples.length > 0) {
        return addHeader(
            "Example Conversations for " + runtime.character.name + "\n\n",
            formattedExamples
        );
    }
    return "";
};

const formatAttachments = (attachments: Media[]) => {
    const formattedAttachments = attachments.map(
        (attachment) =>
            `ID: ${attachment.id}
Name: ${attachment.title}
URL: ${attachment.url}
Type: ${attachment.source}
Description: ${attachment.description}
Text: ${attachment.text}
`
    );
    return joinLines(formattedAttachments);
};

const formatPostDirections = (postDirections: string[], count: number) => {
    const shuffled = shuffleAndSlice(postDirections, count);
    return joinLines(shuffled);
};

function getTopics(runtime: AgentRuntime, topics: string[]): string {
    const count = runtime.getSetting("TOPICS_COUNT") || TOPICS_COUNT;
    const shuffled = shuffleAndSlice(topics, Number(count));
    return joinLines(shuffled, ", ");
}

function buildExample(example: MessagesExample): string {
    const exampleNames = genNames(MESSAGE_EXAMPLES_COUNT);

    return example
        .map((message) => {
            let messageString = `${message.user}: ${message.content.text}`;
            exampleNames.forEach((name, index) => {
                const placeholder = `{{user${index + 1}}}`;
                messageString = messageString.replaceAll(placeholder, name);
            });
            return messageString;
        })
        .join("\n");
}

const genNames = (count: number) => {
    return Array.from({ length: count }, () =>
        uniqueNamesGenerator({ dictionaries: [names] })
    );
};

const shuffleAndSlice = <T>(array: T[], count?: number) => {
    const shuffled = array.sort(() => 0.5 - Math.random());
    if (count) {
        return shuffled.slice(0, count);
    }
    return shuffled;
};

const joinLines = (array: string[], separator: string = "\n") => {
    return array.join(separator);
};

function getRandomElementFromArray<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}
