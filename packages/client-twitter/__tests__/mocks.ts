import { vi } from "vitest";
import {
    ActionTimelineType,
    IAgentRuntime,
    Character,
    State,
    ActionResponse,
    UUID,
} from "@elizaos/core";
import { Tweet } from "agent-twitter-client";

export function buildConfigMock() {
    return {
        TWITTER_USERNAME: "testuser",
        TWITTER_PASSWORD: "hashedpassword",
        TWITTER_EMAIL: "test@example.com",
        TWITTER_2FA_SECRET: "",
        TWITTER_RETRY_LIMIT: 5,
        TWITTER_POLL_INTERVAL: 120,
        TWITTER_KNOWLEDGE_USERS: [],
        MAX_ACTIONS_PROCESSING: 1,
        ACTION_TIMELINE_TYPE: ActionTimelineType.ForYou,
        TWITTER_SEARCH_ENABLE: false,
        TWITTER_SPACES_ENABLE: false,
        TWITTER_TARGET_USERS: [],
        POST_INTERVAL_MIN: 5,
        POST_INTERVAL_MAX: 10,
        ACTION_INTERVAL: 5,
        ENABLE_ACTION_PROCESSING: true,
        POST_IMMEDIATELY: false,
        MAX_TWEET_LENGTH: 280,
    };
}

export function buildRuntimeMock() {
    return {
        env: {
            TWITTER_USERNAME: "testuser",
            TWITTER_POST_INTERVAL_MIN: "5",
            TWITTER_POST_INTERVAL_MAX: "10",
            TWITTER_ACTION_INTERVAL: "5",
            TWITTER_ENABLE_ACTION_PROCESSING: "true",
            TWITTER_POST_IMMEDIATELY: "false",
            TWITTER_SEARCH_ENABLE: "false",
            TWITTER_EMAIL: "test@example.com",
            TWITTER_PASSWORD: "hashedpassword",
            TWITTER_2FA_SECRET: "",
            TWITTER_POLL_INTERVAL: "120",
            TWITTER_RETRY_LIMIT: "5",
            ACTION_TIMELINE_TYPE: "foryou",
            MAX_ACTIONS_PROCESSING: "1",
            MAX_TWEET_LENGTH: "280",
        },
        getEnv: function (key: string) {
            return this.env[key] || null;
        },
        getSetting: function (key: string) {
            return this.env[key] || null;
        },
        character: {
            style: {
                all: ["Test style 1", "Test style 2"],
                post: ["Post style 1", "Post style 2"],
            },
        },
        cacheManager: {
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn(),
        },
        messageManager: {
            createMemory: vi.fn(),
            getMemoryById: vi.fn(),
        },
        ensureRoomExists: vi.fn(),
        ensureUserExists: vi.fn(),
        ensureParticipantInRoom: vi.fn(),
        composeState: vi.fn(),
        getService: vi.fn(),
    } as unknown as IAgentRuntime;
}

export function buildTwitterClientMock() {
    return {
        sendTweet: vi.fn(),
        sendNoteTweet: vi.fn(),
        likeTweet: vi.fn(),
        retweet: vi.fn(),
        getTweet: vi.fn(),
        sendQuoteTweet: vi.fn(),
        fetchTimelineForActions: vi.fn(),
        fetchHomeTimeline: vi.fn(),
        fetchFollowingTimeline: vi.fn(),
    };
}

export const mockTwitterProfile = {
    id: "123",
    username: "testuser",
    screenName: "Test User",
    bio: "Test bio",
    nicknames: ["test"],
};

export const mockCharacter = {
    name: "Test Character",
    topics: ["topic1", "topic2"],
    templates: {
        twitterPostTemplate: "test template",
        twitterMessageHandlerTemplate: "test message template",
        twitterActionTemplate: "test action template",
    },
    modelProvider: "test-provider",
    bio: "Test bio",
    lore: "Test lore",
    messageExamples: ["example1"],
    postExamples: ["post1"],
    style: {
        all: ["style1"],
        post: ["post-style1"],
        message: ["message-style1"],
    },
    characterPostExamples: ["char-post1"],
    messageDirections: "test directions",
    postDirections: "test post directions",
    knowledge: "test knowledge",
    adjectives: ["adj1"],
    clients: [],
    plugins: [],
} as unknown as Character;

export const createSuccessfulTweetResponse = (
    content: string = "Tweet content",
    restId: string = "123"
) => ({
    json: () => ({
        data: {
            create_tweet: {
                tweet_results: {
                    result: {
                        rest_id: restId,
                        legacy: {
                            full_text: content,
                            created_at: new Date().toISOString(),
                            conversation_id_str: restId,
                        },
                    },
                },
            },
        },
    }),
});

export const setupMockTwitterClient = (client: any, tweetContent: string) => {
    client.sendTweet.mockResolvedValue(
        createSuccessfulTweetResponse(tweetContent)
    );

    client.sendNoteTweet.mockResolvedValue({
        data: {
            notetweet_create: {
                tweet_results: {
                    result: {
                        rest_id: "123",
                        legacy: {
                            full_text: tweetContent,
                            created_at: new Date().toISOString(),
                            conversation_id_str: "123",
                        },
                    },
                },
            },
        },
    });
};

export const createMockState = () =>
    ({
        userId: "user-123" as UUID,
        agentId: "agent-123" as UUID,
        bio: "Test bio",
        lore: "Test lore",
        messageDirections: "Test message directions",
        postDirections: "Test post directions",
        roomId: "room-123" as UUID,
        actors: "user1, user2",
        recentMessages: "message1\nmessage2",
        recentMessagesData: [],
        providers: "Test providers",
        topics: "Test topics",
        knowledge: "Test knowledge",
        characterPostExamples: "Test examples",
        content: { text: "", action: "" },
    }) as State;

// Test Fixtures
export const createMockTweet = (overrides: Partial<Tweet> = {}): Tweet => {
    const { text, ...restOverrides } = overrides;
    return {
        id: "123",
        name: "Test User",
        username: "testuser",
        text: text ?? "Test tweet",
        conversationId: "123",
        timestamp: Date.now(),
        userId: "123",
        permanentUrl: "https://twitter.com/testuser/status/123",
        hashtags: [],
        mentions: [],
        photos: [],
        thread: [],
        urls: [],
        videos: [],
        ...restOverrides,
    };
};

export const createMockTimeline = (
    overrides: {
        tweet?: Partial<Tweet>;
        actionResponse?: Partial<ActionResponse>;
        roomId?: UUID;
    } = {}
) => ({
    tweet: createMockTweet(overrides.tweet),
    actionResponse: {
        like: false,
        retweet: false,
        quote: false,
        reply: false,
        ...overrides.actionResponse,
    } as ActionResponse,
    tweetState: createMockState(),
    roomId: overrides.roomId || ("room-123" as UUID),
});
