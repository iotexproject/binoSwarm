import type { Readable } from "stream";
import type { ZodSchema } from "zod";
import type { NodeSDK } from "@opentelemetry/sdk-node";

/**
 * Represents a UUID string in the format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * Represents the content of a message or communication
 */
export interface Content {
    /** The main text content */
    text: string;

    /** Optional action associated with the message */
    action?: string;

    /** Optional source/origin of the content */
    source?: string;

    /** URL of the original message/post (e.g. tweet URL, Discord message link) */
    url?: string;

    /** UUID of parent message if this is a reply/thread */
    inReplyTo?: UUID;

    /** Array of media attachments */
    attachments?: Media[];

    /** Additional dynamic properties */
    [key: string]: unknown;
}

/**
 * Example content with associated user for demonstration purposes
 */
export interface ActionExample {
    /** User associated with the example */
    user: string;

    /** Content of the example */
    content: Content;
}

/**
 * Example conversation content with user ID
 */
export interface ConversationExample {
    /** UUID of user in conversation */
    userId: UUID;

    /** Content of the conversation */
    content: Content;
}

/**
 * Represents an actor/participant in a conversation
 */
export interface Actor {
    /** Display name */
    name: string;

    /** Username/handle */
    username: string;

    /** Additional profile details */
    details: {
        /** Short profile tagline */
        tagline: string;

        /** Longer profile summary */
        summary: string;

        /** Favorite quote */
        quote: string;
    };

    /** Unique identifier */
    id: UUID;
}

/**
 * Represents a single objective within a goal
 */
export interface Objective {
    /** Optional unique identifier */
    id?: string;

    /** Description of what needs to be achieved */
    description: string;

    /** Whether objective is completed */
    completed: boolean;
}

/**
 * Status enum for goals
 */
export enum GoalStatus {
    DONE = "DONE",
    FAILED = "FAILED",
    IN_PROGRESS = "IN_PROGRESS",
}

/**
 * Represents a high-level goal composed of objectives
 */
export interface Goal {
    /** Optional unique identifier */
    id?: UUID;

    /** Room ID where goal exists */
    roomId: UUID;

    /** User ID of goal owner */
    userId: UUID;

    /** Name/title of the goal */
    name: string;

    /** Current status */
    status: GoalStatus;

    /** Component objectives */
    objectives: Objective[];
}

/**
 * Model size/type classification
 */
export enum ModelClass {
    SMALL = "small",
    MEDIUM = "medium",
    LARGE = "large",
    EMBEDDING = "embedding",
    IMAGE = "image",
    FAST = "fast", // for latency-sensitive applications, eg voice
}

/**
 * Model settings
 */
export type ModelSettings = {
    /** Model name */
    name: string;

    /** Maximum input tokens */
    maxInputTokens: number;

    /** Maximum output tokens */
    maxOutputTokens: number;

    /** Optional frequency penalty */
    frequency_penalty?: number;

    /** Optional presence penalty */
    presence_penalty?: number;

    /** Optional repetition penalty */
    repetition_penalty?: number;

    /** Stop sequences */
    stop: string[];

    /** Temperature setting */
    temperature: number;

    /** Optional telemetry configuration (experimental) */
    experimental_telemetry?: TelemetrySettings;
};

/**
 * Model settings
 */
export type GenerationSettings = {
    /** Prompt */
    prompt: string;

    /** Maximum output tokens */
    maxTokens: number;

    /** Optional frequency penalty */
    frequencyPenalty?: number;

    /** Optional presence penalty */
    presencePenalty?: number;

    /** Optional repetition penalty */
    repetition_penalty?: number;

    /** Stop sequences */
    stop: string[];

    /** Temperature setting */
    temperature: number;

    /** Optional telemetry configuration (experimental) */
    experimental_telemetry?: TelemetrySettings;
};

/** Image model settings */
export type ImageModelSettings = {
    name: string;
    steps?: number;
};

/** Embedding model settings */
export type EmbeddingModelSettings = {
    name: string;
    dimensions?: number;
};

/**
 * Configuration for an AI model
 */
export type Model = {
    /** Optional API endpoint */
    endpoint?: string;

    /** Model names by size class */
    model: {
        [ModelClass.SMALL]?: ModelSettings;
        [ModelClass.MEDIUM]?: ModelSettings;
        [ModelClass.LARGE]?: ModelSettings;
        [ModelClass.FAST]?: ModelSettings;
        [ModelClass.EMBEDDING]?: EmbeddingModelSettings;
        [ModelClass.IMAGE]?: ImageModelSettings;
    };
};

/**
 * Model configurations by provider
 */
export type Models = {
    [ModelProviderName.OPENAI]: Model;
    [ModelProviderName.ANTHROPIC]: Model;
    [ModelProviderName.GROK]: Model;
    [ModelProviderName.LLAMALOCAL]: Model;
    [ModelProviderName.OLLAMA]: Model;
    [ModelProviderName.DEEPSEEK]: Model;
    [ModelProviderName.OPENROUTER]: Model;
};

/**
 * Available model providers
 */
export enum ModelProviderName {
    OPENAI = "openai",
    ANTHROPIC = "anthropic",
    GROK = "grok",
    LLAMALOCAL = "llama_local",
    OLLAMA = "ollama",
    DEEPSEEK = "deepseek",
    INFERA = "infera",
    OPENROUTER = "openrouter",
}

/**
 * Represents the current state/context of a conversation
 */
export interface State {
    /** ID of user who sent current message */
    userId?: UUID;

    /** ID of agent in conversation */
    agentId?: UUID;

    /** Agent's biography */
    bio: string;

    /** Agent's background lore */
    lore: string;

    /** Message handling directions */
    messageDirections: string;

    /** Post handling directions */
    postDirections: string;

    /** Current room/conversation ID */
    roomId: UUID;

    /** Optional agent name */
    agentName?: string;

    /** Optional message sender name */
    senderName?: string;

    /** String representation of conversation actors */
    actors: string;

    /** Optional array of actor objects */
    actorsData?: Actor[];

    /** Optional string representation of goals */
    goals?: string;

    /** Optional array of goal objects */
    goalsData?: Goal[];

    /** Recent message history as string */
    recentMessages: string;

    /** Recent message objects */
    recentMessagesData: Memory[];

    /** Optional valid action names */
    actionNames?: string;

    /** Optional action descriptions */
    actions?: string;

    /** Optional action objects */
    actionsData?: Action[];

    /** Optional action examples */
    actionExamples?: string;

    /** Optional provider descriptions */
    providers?: string;

    /** Optional response content */
    responseData?: Content;

    /** Optional recent interaction objects */
    recentInteractionsData?: Memory[];

    /** Optional recent interactions string */
    recentInteractions?: string;

    /** Optional formatted conversation */
    formattedConversation?: string;

    /** Optional formatted knowledge */
    knowledge?: string;
    /** Optional knowledge data */
    knowledgeData?: KnowledgeItem[];
    /** Optional knowledge data */
    ragKnowledgeData?: RAGKnowledgeItem[];

    /** Additional dynamic properties */
    [key: string]: unknown;
}

/**
 * Represents a stored memory/message
 */
export interface Memory {
    /** Optional unique identifier */
    id?: UUID;

    /** Associated user ID */
    userId: UUID;

    /** Associated agent ID */
    agentId: UUID;

    /** Optional creation timestamp */
    createdAt?: number;

    /** Memory content */
    content: Content;

    /** Associated room ID */
    roomId: UUID;

    /** Whether memory is unique */
    unique?: boolean;
}

/**
 * Example message for demonstration
 */
export interface MessageExample {
    /** Associated user */
    user: string;

    /** Message content */
    content: Content;
}

/**
 * Handler function type for processing messages
 */
export type Handler = (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
) => Promise<unknown>;

/**
 * Callback function type for handlers
 */
export type HandlerCallback = (
    response: Content,
    files?: Array<{
        attachment: string;
        name: string;
    }>
) => Promise<Memory[]>;

/**
 * Validator function type for actions/evaluators
 */
export type Validator = (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
) => Promise<boolean>;

/**
 * Represents an action the agent can perform
 */
export interface Action {
    /** Similar action descriptions */
    similes: string[];

    /** Detailed description */
    description: string;

    /** Example usages */
    examples: ActionExample[][];

    /** Handler function */
    handler: Handler;

    /** Action name */
    name: string;

    /** Validation function */
    validate: Validator;

    /** Whether to suppress the initial message when this action is used */
    suppressInitialMessage?: boolean;
}

/**
 * Example for evaluating agent behavior
 */
export interface EvaluationExample {
    /** Evaluation context */
    context: string;

    /** Example messages */
    messages: Array<ActionExample>;

    /** Expected outcome */
    outcome: string;
}

/**
 * Evaluator for assessing agent responses
 */
export interface Evaluator {
    /** Whether to always run */
    alwaysRun?: boolean;

    /** Detailed description */
    description: string;

    /** Similar evaluator descriptions */
    similes: string[];

    /** Example evaluations */
    examples: EvaluationExample[];

    /** Handler function */
    handler: Handler;

    /** Evaluator name */
    name: string;

    /** Validation function */
    validate: Validator;
}

/**
 * Provider for external data/services
 */
export interface Provider {
    /** Data retrieval function */
    get: (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ) => Promise<any>;
}

/**
 * Represents a relationship between users
 */
export interface Relationship {
    /** Unique identifier */
    id: UUID;

    /** First user ID */
    userA: UUID;

    /** Second user ID */
    userB: UUID;

    /** Primary user ID */
    userId: UUID;

    /** Associated room ID */
    roomId: UUID;

    /** Relationship status */
    status: string;

    /** Optional creation timestamp */
    createdAt?: string;
}

/**
 * Represents a user account
 */
export interface Account {
    /** Unique identifier */
    id: UUID;

    /** Display name */
    name: string;

    /** Username */
    username: string;

    /** Optional additional details */
    details?: { [key: string]: any };

    /** Optional email */
    email?: string;

    /** Optional avatar URL */
    avatarUrl?: string;
}

/**
 * Room participant with account details
 */
export interface Participant {
    /** Unique identifier */
    id: UUID;

    /** Associated account */
    account: Account;
}

/**
 * Represents a conversation room
 */
export interface Room {
    /** Unique identifier */
    id: UUID;

    /** Room participants */
    participants: Participant[];
}

/**
 * Represents a media attachment
 */
export type Media = {
    /** Unique identifier */
    id: string;

    /** Media URL */
    url: string;

    /** Media title */
    title: string;

    /** Media source */
    source: string;

    /** Media description */
    description: string;

    /** Text content */
    text: string;

    /** Content type */
    contentType?: string;
};

/**
 * Client interface for platform connections
 */
export type Client = {
    /** Start client connection */
    start: (runtime: IAgentRuntime) => Promise<unknown>;

    /** Stop client connection */
    stop: (runtime: IAgentRuntime) => Promise<unknown>;
};

/**
 * Plugin for extending agent functionality
 */
export type Plugin = {
    /** Plugin name */
    name: string;

    /** Plugin description */
    description: string;

    /** Optional actions */
    actions?: Action[];

    /** Optional providers */
    providers?: Provider[];

    /** Optional evaluators */
    evaluators?: Evaluator[];

    /** Optional services */
    services?: Service[];

    /** Optional clients */
    clients?: Client[];
};

/**
 * Available client platforms
 */
export enum Clients {
    DISCORD = "discord",
    DIRECT = "direct",
    TWITTER = "twitter",
    TELEGRAM = "telegram",
}

export interface IAgentConfig {
    [key: string]: string;
}

export type AttributeValue = string | string[] | number | boolean | null;

export type TelemetrySettings = {
    /**
     * Enable or disable telemetry. Disabled by default while experimental.
     */
    isEnabled?: boolean;
    /**
     * Enable or disable input recording. Enabled by default.
     *
     * You might want to disable input recording to avoid recording sensitive
     * information, to reduce data transfers, or to increase performance.
     */
    recordInputs?: boolean;
    /**
     * Enable or disable output recording. Enabled by default.
     *
     * You might want to disable output recording to avoid recording sensitive
     * information, to reduce data transfers, or to increase performance.
     */
    recordOutputs?: boolean;
    /**
     * Identifier for this function. Used to group telemetry data by function.
     */
    functionId?: string;

    /**
     * Metadata for the telemetry data.
     */
    metadata?: Record<string, AttributeValue>;
};

export interface ModelConfiguration {
    temperature?: number;
    max_response_length?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    maxInputTokens?: number;
    experimental_telemetry?: TelemetrySettings;
}

export type TemplateType = string | ((options: { state: State }) => string);

/**
 * Configuration for an agent character
 */
export type Character = {
    /** Optional unique identifier */
    id?: UUID;

    /** Character name */
    name: string;

    /** Optional username */
    username?: string;

    /** Optional system prompt */
    system?: string;

    /** Model provider to use */
    modelProvider: ModelProviderName;

    /** Image model provider to use, if different from modelProvider */
    imageModelProvider?: ModelProviderName;

    /** Image Vision model provider to use, if different from modelProvider */
    imageVisionModelProvider?: ModelProviderName;

    /** Optional model endpoint override */
    modelEndpointOverride?: string;

    /** Optional prompt templates */
    templates?: {
        goalsTemplate?: TemplateType;
        factsTemplate?: TemplateType;
        messageHandlerTemplate?: TemplateType;
        directMessageHandlerTemplate?: TemplateType;
        directMessageStreamTemplate?: TemplateType;
        directVoiceStreamTemplate?: TemplateType;
        shouldRespondTemplate?: TemplateType;
        continueMessageHandlerTemplate?: TemplateType;
        evaluationTemplate?: TemplateType;
        twitterSearchTemplate?: TemplateType;
        twitterActionTemplate?: TemplateType;
        twitterPostTemplate?: TemplateType;
        twitterPostWithQS?: TemplateType;
        twitterQSPrompt?: TemplateType;
        twitterMessageHandlerTemplate?: TemplateType;
        twitterShouldRespondTemplate?: TemplateType;
        farcasterPostTemplate?: TemplateType;
        farcasterMessageHandlerTemplate?: TemplateType;
        farcasterShouldRespondTemplate?: TemplateType;
        telegramMessageHandlerTemplate?: TemplateType;
        telegramShouldRespondTemplate?: TemplateType;
        discordVoiceHandlerTemplate?: TemplateType;
        discordShouldRespondTemplate?: TemplateType;
        discordMessageHandlerTemplate?: TemplateType;
        discourseMessageHandlerTemplate?: TemplateType;
        slackMessageHandlerTemplate?: TemplateType;
        slackShouldRespondTemplate?: TemplateType;
        imageSystemPrompt?: string;
        memeSystemPrompt?: string;
        memePromptTemplate?: TemplateType;
        imagePromptTemplate?: TemplateType;
    };

    /** Character biography */
    bio: string | string[];

    /** Character background lore */
    lore: string[];

    /** Example messages */
    messageExamples: MessageExample[][];

    /** Example posts */
    postExamples: string[];

    /** Known topics */
    topics: string[];

    /** Character traits */
    adjectives: string[];

    /** Optional knowledge base */
    knowledge?: (string | { path: string; shared?: boolean })[];

    /** Supported client platforms */
    clients: Clients[];

    /** Available plugins */
    plugins: Plugin[];

    /** Optional configuration */
    settings?: {
        secrets?: { [key: string]: string };
        imageSettings?: {
            steps?: number;
            width?: number;
            height?: number;
            negativePrompt?: string;
            numIterations?: number;
            guidanceScale?: number;
            seed?: number;
            modelId?: string;
            jobId?: string;
            count?: number;
            stylePreset?: string;
            hideWatermark?: boolean;
        };
        voice?: {
            model?: string; // For VITS
            url?: string; // Legacy VITS support
            elevenlabs?: {
                // New structured ElevenLabs config
                voiceId: string;
                model?: string;
                stability?: string;
                similarityBoost?: string;
                style?: string;
                useSpeakerBoost?: string;
            };
        };
        model?: string;
        modelConfig?: ModelConfiguration;
        embeddingModel?: string;
        chains?: {
            evm?: any[];
            solana?: any[];
            [key: string]: any[];
        };
        transcription?: TranscriptionProvider;
        ragKnowledge?: boolean;
    };

    /** Optional client-specific config */
    clientConfig?: {
        discord?: {
            shouldIgnoreBotMessages?: boolean;
            shouldIgnoreDirectMessages?: boolean;
            shouldRespondOnlyToMentions?: boolean;
            messageSimilarityThreshold?: number;
        };
        telegram?: {
            shouldIgnoreBotMessages?: boolean;
            shouldIgnoreDirectMessages?: boolean;
            shouldRespondOnlyToMentions?: boolean;
            shouldOnlyJoinInAllowedGroups?: boolean;
            allowedGroupIds?: string[];
            messageSimilarityThreshold?: number;
        };
    };

    /** Writing style guides */
    style: {
        all: string[];
        chat: string[];
        post: string[];
    };

    /** Optional Twitter profile */
    twitterProfile?: {
        id: string;
        username: string;
        screenName: string;
        bio: string;
        nicknames?: string[];
    };
    /** Optional NFT prompt */
    nft?: {
        prompt: string;
    };
    /**Optinal Parent characters to inherit information from */
    extends?: string[];

    /** Optional MCP server configurations */
    mcpServers?: {
        [key: string]: MCPServerConfig;
    };

    /** Optional collaborator configurations */
    collaborators?: Array<{
        name: string;
        url: string;
        expertise: string;
    }>;
};

export interface MCPServerConfig {
    description: string;
    command?: string;
    args?: string[];
    url?: string;
}

export interface CharacterDBTraits {
    id: string;
    agent_id: string;
    system_prompt?: string;
    bio?: string[];
    lore?: string[];
    knowledge?: string[];
    messageExamples?: MessageExample[][];
    postExamples?: string[];
    topics?: string[];
    adjectives?: string[];
    style?: {
        all?: string[];
        chat?: string[];
        post?: string[];
    };
    templates?: { [key: string]: string };
    env_twitter_target_users?: string[];
    env_twitter_knowledge_users?: string[];
}
/**
 * Interface for database operations
 */
export interface IDatabaseAdapter {
    /** Database instance */
    db: any;

    /** Optional initialization */
    init(): Promise<void>;

    /** Close database connection */
    close(): Promise<void>;

    /** Get account by ID */
    getAccountById(userId: UUID): Promise<Account | null>;

    /** Create new account */
    createAccount(account: Account): Promise<boolean>;

    /** Get memories matching criteria */
    getMemories(params: {
        roomId: UUID;
        count?: number;
        unique?: boolean;
        tableName: string;
        agentId: UUID;
        start?: number;
        end?: number;
    }): Promise<Memory[]>;

    getMemoryById(id: UUID): Promise<Memory | null>;

    getMemoriesByRoomIds(params: {
        tableName: string;
        agentId: UUID;
        roomIds: UUID[];
        limit?: number;
        userId?: UUID;
    }): Promise<Memory[]>;

    getActorDetails(params: { roomId: UUID }): Promise<Actor[]>;

    updateGoalStatus(params: {
        goalId: UUID;
        status: GoalStatus;
    }): Promise<void>;

    createMemory(
        memory: Memory,
        tableName: string,
        unique?: boolean
    ): Promise<void>;

    removeMemory(memoryId: UUID, tableName: string): Promise<void>;

    removeAllMemories(roomId: UUID, tableName: string): Promise<void>;

    countMemories(
        roomId: UUID,
        unique?: boolean,
        tableName?: string
    ): Promise<number>;

    countMemoriesForUser(params: {
        userId: UUID;
        agentId: UUID;
        tableName: string;
    }): Promise<number>;

    getGoals(params: {
        agentId: UUID;
        roomId: UUID;
        userId?: UUID | null;
        onlyInProgress?: boolean;
        count?: number;
    }): Promise<Goal[]>;

    updateGoal(goal: Goal): Promise<void>;

    createGoal(goal: Goal): Promise<void>;

    removeGoal(goalId: UUID): Promise<void>;

    removeAllGoals(roomId: UUID): Promise<void>;

    getRoom(roomId: UUID): Promise<UUID | null>;

    createRoom(roomId?: UUID): Promise<UUID>;

    removeRoom(roomId: UUID): Promise<void>;

    getRoomsForParticipant(userId: UUID): Promise<UUID[]>;

    getRoomsForParticipants(userIds: UUID[]): Promise<UUID[]>;

    addParticipant(userId: UUID, roomId: UUID): Promise<boolean>;

    removeParticipant(userId: UUID, roomId: UUID): Promise<boolean>;

    getParticipantsForAccount(userId: UUID): Promise<Participant[]>;

    getParticipantsForRoom(roomId: UUID): Promise<UUID[]>;

    getParticipantUserState(
        roomId: UUID,
        userId: UUID
    ): Promise<"FOLLOWED" | "MUTED" | null>;

    setParticipantUserState(
        roomId: UUID,
        userId: UUID,
        state: "FOLLOWED" | "MUTED" | null
    ): Promise<void>;

    createRelationship(params: { userA: UUID; userB: UUID }): Promise<boolean>;

    getRelationship(params: {
        userA: UUID;
        userB: UUID;
    }): Promise<Relationship | null>;

    getRelationships(params: { userId: UUID }): Promise<Relationship[]>;

    getKnowledgeByIds(params: {
        ids: UUID[];
        agentId: UUID;
    }): Promise<RAGKnowledgeItem[]>;
    getKnowledge(id: UUID): Promise<RAGKnowledgeItem | null>;

    createKnowledge(knowledge: RAGKnowledgeItem): Promise<void>;
    removeKnowledge(id: UUID): Promise<void>;
    clearKnowledge(agentId: UUID, shared?: boolean): Promise<void>;
    getIsUserInTheRoom(roomId: UUID, userId: UUID): Promise<boolean>;
    getAccountsByIds(actorIds: UUID[]): Promise<Actor[]>;
    getCharacterDbTraits(
        characterId: UUID
    ): Promise<CharacterDBTraits | undefined>;
    deleteAccount(userId: UUID): Promise<void>;
}

export interface IDatabaseCacheAdapter {
    getCache(params: {
        agentId: UUID;
        key: string;
    }): Promise<string | undefined>;

    setCache(params: {
        agentId: UUID;
        key: string;
        value: string;
    }): Promise<boolean>;

    deleteCache(params: { agentId: UUID; key: string }): Promise<boolean>;
}

export interface IMemoryManager {
    runtime: IAgentRuntime;
    tableName: string;
    constructor: Function;

    getMemories(opts: {
        roomId: UUID;
        count?: number;
        unique?: boolean;
        start?: number;
        end?: number;
    }): Promise<Memory[]>;

    getCachedEmbeddings(content: string): Promise<number[]>;

    getMemoryById(id: UUID): Promise<Memory | null>;
    getMemoriesByRoomIds(params: {
        roomIds: UUID[];
        limit?: number;
        userId?: UUID;
    }): Promise<Memory[]>;

    createMemory(params: { memory: Memory; isUnique: boolean }): Promise<void>;

    removeMemory(memoryId: UUID): Promise<void>;

    removeAllMemories(roomId: UUID): Promise<void>;

    countMemories(roomId: UUID, unique?: boolean): Promise<number>;

    countMemoriesForUser(userId: UUID): Promise<number>;
}

export interface IRAGKnowledgeManager {
    runtime: IAgentRuntime;

    getKnowledge(params: {
        query?: string;
        id?: UUID;
        limit?: number;
        conversationContext?: string;
        agentId?: UUID;
        isUnique?: boolean;
    }): Promise<RAGKnowledgeItem[]>;
    createKnowledge(
        item: RAGKnowledgeItem,
        source: string,
        isUnique: boolean
    ): Promise<void>;
    removeKnowledge(id: UUID): Promise<void>;
    searchKnowledge(params: {
        agentId: UUID;
        embedding: Float32Array | number[];
        match_threshold?: number;
        match_count?: number;
        searchText?: string;
    }): Promise<RAGKnowledgeItem[]>;
    clearKnowledge(shared?: boolean): Promise<void>;
    processFile(file: {
        path: string;
        content: string;
        type: "pdf" | "md" | "txt";
        isShared: boolean;
    }): Promise<void>;
    processCharacterRAGKnowledge(
        items: (string | { path: string; shared?: boolean })[]
    ): Promise<void>;
    checkExistingKnowledge(text: string): Promise<boolean>;
}

export type CacheOptions = {
    expires?: number;
};

export enum CacheStore {
    REDIS = "redis",
    DATABASE = "database",
    FILESYSTEM = "filesystem",
}

export interface ICacheManager {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
    delete(key: string): Promise<void>;
}

export abstract class Service {
    private static instance: Service | null = null;

    static get serviceType(): ServiceType {
        throw new Error("Service must implement static serviceType getter");
    }

    public static getInstance<T extends Service>(): T {
        if (!Service.instance) {
            Service.instance = new (this as any)();
        }
        return Service.instance as T;
    }

    get serviceType(): ServiceType {
        return (this.constructor as typeof Service).serviceType;
    }

    // Add abstract initialize method that must be implemented by derived classes
    abstract initialize(runtime: IAgentRuntime): Promise<void>;
}

export interface IAgentRuntime {
    // Properties
    agentId: UUID;
    serverUrl: string;
    databaseAdapter: IDatabaseAdapter;
    token: string | null;
    modelProvider: ModelProviderName;
    imageModelProvider: ModelProviderName;
    imageVisionModelProvider: ModelProviderName;
    character: Character;
    providers: Provider[];
    actions: Action[];
    evaluators: Evaluator[];
    plugins: Plugin[];
    metering: IMetering;
    telemetry: NodeSDK;

    fetch?: typeof fetch | null;

    messageManager: IMemoryManager;
    descriptionManager: IMemoryManager;
    documentsManager: IMemoryManager;
    ragKnowledgeManager: IRAGKnowledgeManager;
    loreManager: IMemoryManager;

    cacheManager: ICacheManager;

    services: Map<ServiceType, Service>;
    // any could be EventEmitter
    // but I think the real solution is forthcoming as a base client interface
    clients: Record<string, any>;

    mcpManager: any;
    mcpTools: any;

    verifiableInferenceAdapter?: IVerifiableInferenceAdapter | null;

    initialize(): Promise<void>;

    registerMemoryManager(manager: IMemoryManager): void;

    getMemoryManager(name: string): IMemoryManager | null;

    getService<T extends Service>(service: ServiceType): T | null;

    registerService(service: Service): void;

    getSetting(key: string): string | null;

    // Methods
    getConversationLength(): number;

    processActions(
        message: Memory,
        responses: Memory[],
        state?: State,
        callback?: HandlerCallback,
        options?: {
            // can be used to add tags to the telemetry data
            tags?: string[];
        }
    ): Promise<void>;

    evaluate(
        message: Memory,
        state?: State,
        didRespond?: boolean,
        callback?: HandlerCallback
    ): Promise<string[] | null>;

    ensureParticipantExists(userId: UUID, roomId: UUID): Promise<void>;

    ensureUserExists(
        userId: UUID,
        userName: string | null,
        name: string | null,
        source: string | null
    ): Promise<void>;

    registerAction(action: Action): void;

    ensureConnection(
        userId: UUID,
        roomId: UUID,
        userName?: string,
        userScreenName?: string,
        source?: string
    ): Promise<void>;

    ensureParticipantInRoom(userId: UUID, roomId: UUID): Promise<void>;

    ensureRoomExists(roomId: UUID): Promise<void>;

    composeState(
        message: Memory,
        additionalKeys?: { [key: string]: unknown },
        fastMode?: boolean
    ): Promise<State>;

    updateRecentMessageState(state: State): Promise<State>;
}

export interface IImageDescriptionService extends Service {
    describeImage(
        imageUrl: string
    ): Promise<{ title: string; description: string }>;
}

export interface ITranscriptionService extends Service {
    transcribeAttachment(audioBuffer: ArrayBuffer): Promise<string | null>;
    transcribeAttachmentLocally(
        audioBuffer: ArrayBuffer
    ): Promise<string | null>;
    transcribe(audioBuffer: ArrayBuffer): Promise<string | null>;
    transcribeLocally(audioBuffer: ArrayBuffer): Promise<string | null>;
}

export interface IVideoService extends Service {
    isVideoUrl(url: string): boolean;
    fetchVideoInfo(url: string): Promise<Media>;
    downloadVideo(videoInfo: Media): Promise<string>;
    processVideo(url: string, runtime: IAgentRuntime): Promise<Media>;
}

export interface ITextGenerationService extends Service {
    initializeModel(): Promise<void>;
    queueMessageCompletion(
        context: string,
        temperature: number,
        stop: string[],
        frequency_penalty: number,
        presence_penalty: number,
        max_tokens: number
    ): Promise<any>;
    queueTextCompletion(
        context: string,
        temperature: number,
        stop: string[],
        frequency_penalty: number,
        presence_penalty: number,
        max_tokens: number
    ): Promise<string>;
    getEmbeddingResponse(input: string): Promise<number[] | undefined>;
}

export interface IBrowserService extends Service {
    closeBrowser(): Promise<void>;
    getPageContent(
        url: string,
        runtime: IAgentRuntime
    ): Promise<{ title: string; description: string; bodyContent: string }>;
}

export interface ISpeechService extends Service {
    getInstance(): ISpeechService;
    generate(runtime: IAgentRuntime, text: string): Promise<Readable>;
}

export interface IPdfService extends Service {
    getInstance(): IPdfService;
    convertPdfToText(pdfBuffer: Buffer): Promise<string>;
}

export interface UploadIrysResult {
    success: boolean;
    url?: string;
    error?: string;
    data?: any;
}

export interface DataIrysFetchedFromGQL {
    success: boolean;
    data: any;
    error?: string;
}

export interface GraphQLTag {
    name: string;
    values: any[];
}

export const enum IrysMessageType {
    REQUEST = "REQUEST",
    DATA_STORAGE = "DATA_STORAGE",
    REQUEST_RESPONSE = "REQUEST_RESPONSE",
}

export const enum IrysDataType {
    FILE = "FILE",
    IMAGE = "IMAGE",
    OTHER = "OTHER",
}

export interface IrysTimestamp {
    from: number;
    to: number;
}

export interface IIrysService extends Service {
    getDataFromAnAgent(
        agentsWalletPublicKeys: string[],
        tags: GraphQLTag[],
        timestamp: IrysTimestamp
    ): Promise<DataIrysFetchedFromGQL>;
    workerUploadDataOnIrys(
        data: any,
        dataType: IrysDataType,
        messageType: IrysMessageType,
        serviceCategory: string[],
        protocol: string[],
        validationThreshold: number[],
        minimumProviders: number[],
        testProvider: boolean[],
        reputation: number[]
    ): Promise<UploadIrysResult>;
    providerUploadDataOnIrys(
        data: any,
        dataType: IrysDataType,
        serviceCategory: string[],
        protocol: string[]
    ): Promise<UploadIrysResult>;
}

export interface ITeeLogService extends Service {
    getInstance(): ITeeLogService;
    log(
        agentId: string,
        roomId: string,
        userId: string,
        type: string,
        content: string
    ): Promise<boolean>;
}

export type SearchImage = {
    url: string;
    description?: string;
};

export type SearchResult = {
    title: string;
    url: string;
    content: string;
    rawContent?: string;
    score: number;
    publishedDate?: string;
};

export type SearchResponse = {
    answer?: string;
    query: string;
    responseTime: number;
    images: SearchImage[];
    results: SearchResult[];
};

export enum ServiceType {
    IMAGE_DESCRIPTION = "image_description",
    TRANSCRIPTION = "transcription",
    VIDEO = "video",
    BROWSER = "browser",
    SPEECH_GENERATION = "speech_generation",
    PDF = "pdf",
}

export enum LoggingLevel {
    DEBUG = "debug",
    VERBOSE = "verbose",
    NONE = "none",
}

export type KnowledgeItem = {
    id: UUID;
    content: Content;
};

export interface RAGKnowledgeItem {
    id: UUID;
    agentId: UUID;
    content: {
        text: string;
        metadata?: {
            isMain?: boolean;
            isChunk?: boolean;
            originalId?: UUID;
            chunkIndex?: number;
            source?: string;
            type?: string;
            isShared?: boolean;
            [key: string]: unknown;
        };
    };
    createdAt?: number;
    score?: number;
}

export interface ActionResponse {
    like: boolean;
    retweet: boolean;
    quote?: boolean;
    reply?: boolean;
}

export interface ISlackService extends Service {
    client: any;
}

/**
 * Available verifiable inference providers
 */
export enum VerifiableInferenceProvider {
    RECLAIM = "reclaim",
    OPACITY = "opacity",
    PRIMUS = "primus",
}

/**
 * Options for verifiable inference
 */
export interface VerifiableInferenceOptions {
    /** Custom endpoint URL */
    endpoint?: string;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Provider-specific options */
    providerOptions?: Record<string, unknown>;
}

/**
 * Result of a verifiable inference request
 */
export interface VerifiableInferenceResult {
    /** Generated text */
    text: string;
    /** Proof */
    proof: any;
    /** Proof id */
    id?: string;
    /** Provider information */
    provider: VerifiableInferenceProvider;
    /** Timestamp */
    timestamp: number;
}

/**
 * Interface for verifiable inference adapters
 */
export interface IVerifiableInferenceAdapter {
    options: any;
    /**
     * Generate text with verifiable proof
     * @param context The input text/prompt
     * @param modelClass The model class/name to use
     * @param options Additional provider-specific options
     * @returns Promise containing the generated text and proof data
     */
    generateText(
        context: string,
        modelClass: string,
        options?: VerifiableInferenceOptions
    ): Promise<VerifiableInferenceResult>;

    /**
     * Verify the proof of a generated response
     * @param result The result containing response and proof to verify
     * @returns Promise indicating if the proof is valid
     */
    verifyProof(result: VerifiableInferenceResult): Promise<boolean>;
}

export enum TokenizerType {
    Auto = "auto",
    TikToken = "tiktoken",
}

export enum TranscriptionProvider {
    OpenAI = "openai",
    Deepgram = "deepgram",
    Local = "local",
}

export enum ActionTimelineType {
    ForYou = "foryou",
    Following = "following",
}

/**
 * Represents a CloudEvent compatible event for metering
 */
export interface MeteringEvent {
    /** CloudEvents spec version */
    specversion: string;

    /** Event type */
    type: string;

    /** Unique event identifier */
    id: UUID;

    /** Event timestamp */
    time: string;

    /** Event source */
    source: string;

    /** Subject of the event (usually customer ID) */
    subject: string;

    /** Event payload data */
    data: Record<string, unknown>;
}

export interface TrackPromptParams {
    tokens: number;
    model: string;
    type: "input" | "output" | "system";
    id?: UUID;
}

export interface IMetering {
    track(event: MeteringEvent): void;
    trackPrompt(params: TrackPromptParams): void;
    createEvent(params: {
        type: string;
        data: Record<string, unknown>;
        id?: UUID;
    }): MeteringEvent;
}

export type GenerationOptions = {
    runtime: IAgentRuntime;
    context: string;
    modelClass: ModelClass;
    schema: ZodSchema;
    schemaName: string;
    schemaDescription: string;
    stop?: string[];
    mode?: "auto" | "json" | "tool";
    experimental_providerMetadata?: Record<string, unknown>;
    verifiableInference?: boolean;
    verifiableInferenceAdapter?: IVerifiableInferenceAdapter;
    verifiableInferenceOptions?: VerifiableInferenceOptions;
    customSystemPrompt?: string;
    tags: string[];
    functionId: string;
    message?: Memory;
};
