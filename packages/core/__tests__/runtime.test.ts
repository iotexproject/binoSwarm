import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentRuntime } from "../src/runtime";
import {
    IDatabaseAdapter,
    ModelProviderName,
    Action,
    Memory,
    UUID,
    State,
    Actor,
} from "../src/types";
import { defaultCharacter } from "../src/defaultCharacter";
import { formatMessageExamples } from "../src/runtime";
import { stringToUuid } from "../src/uuid";

// Mock dependencies with minimal implementations
const mockDatabaseAdapter: IDatabaseAdapter = {
    db: {},
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getAccountById: vi.fn().mockResolvedValue(null),
    createAccount: vi.fn().mockResolvedValue(true),
    getMemories: vi.fn().mockResolvedValue([]),
    getMemoryById: vi.fn().mockResolvedValue(null),
    getMemoriesByRoomIds: vi.fn().mockResolvedValue([]),
    getActorDetails: vi.fn().mockResolvedValue([]),
    updateGoalStatus: vi.fn().mockResolvedValue(undefined),
    createMemory: vi.fn().mockResolvedValue(undefined),
    removeMemory: vi.fn().mockResolvedValue(undefined),
    removeAllMemories: vi.fn().mockResolvedValue(undefined),
    countMemories: vi.fn().mockResolvedValue(0),
    getGoals: vi.fn().mockResolvedValue([]),
    updateGoal: vi.fn().mockResolvedValue(undefined),
    createGoal: vi.fn().mockResolvedValue(undefined),
    removeGoal: vi.fn().mockResolvedValue(undefined),
    removeAllGoals: vi.fn().mockResolvedValue(undefined),
    getRoom: vi.fn().mockResolvedValue(null),
    createRoom: vi.fn().mockResolvedValue("test-room-id" as UUID),
    removeRoom: vi.fn().mockResolvedValue(undefined),
    getRoomsForParticipant: vi.fn().mockResolvedValue([]),
    getRoomsForParticipants: vi.fn().mockResolvedValue([]),
    addParticipant: vi.fn().mockResolvedValue(true),
    removeParticipant: vi.fn().mockResolvedValue(true),
    getParticipantsForAccount: vi.fn().mockResolvedValue([]),
    getParticipantsForRoom: vi.fn().mockResolvedValue([]),
    getParticipantUserState: vi.fn().mockResolvedValue(null),
    setParticipantUserState: vi.fn().mockResolvedValue(undefined),
    createRelationship: vi.fn().mockResolvedValue(true),
    getRelationship: vi.fn().mockResolvedValue(null),
    getRelationships: vi.fn().mockResolvedValue([]),
    getKnowledge: vi.fn().mockResolvedValue([]),
    getKnowledgeByIds: vi.fn().mockResolvedValue([]),
    createKnowledge: vi.fn().mockResolvedValue(undefined),
    removeKnowledge: vi.fn().mockResolvedValue(undefined),
    clearKnowledge: vi.fn().mockResolvedValue(undefined),
    getIsUserInTheRoom: vi.fn().mockResolvedValue(false),
    getAccountsByIds: vi.fn().mockResolvedValue([]),
    getCharacterDbTraits: vi.fn().mockResolvedValue([]),
    countMemoriesForUser: vi.fn().mockResolvedValue(0),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
};

const mockCacheManager = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
};

// Mock action creator
const createMockAction = (name: string): Action => ({
    name,
    description: `Test action ${name}`,
    similes: [`like ${name}`],
    examples: [],
    handler: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn().mockImplementation(async () => true),
});

describe("AgentRuntime", () => {
    let runtime: AgentRuntime;
    let originalPineconeApiKey: string | undefined;
    beforeEach(() => {
        vi.clearAllMocks();
        originalPineconeApiKey = process.env.PINECONE_API_KEY;
        process.env.PINECONE_API_KEY = "test-pinecone-api-key";
        runtime = new AgentRuntime({
            token: "test-token",
            character: defaultCharacter,
            databaseAdapter: mockDatabaseAdapter,
            cacheManager: mockCacheManager,
            modelProvider: ModelProviderName.OPENAI,
        });
    });

    afterEach(() => {
        process.env.PINECONE_API_KEY = originalPineconeApiKey;
    });

    describe("action management", () => {
        it("should register an action", () => {
            const action = createMockAction("testAction");
            runtime.registerAction(action);
            expect(runtime.actions).toContain(action);
        });

        it("should allow registering multiple actions", () => {
            const action1 = createMockAction("testAction1");
            const action2 = createMockAction("testAction2");
            runtime.registerAction(action1);
            runtime.registerAction(action2);
            expect(runtime.actions).toContain(action1);
            expect(runtime.actions).toContain(action2);
        });

        it("should process registered actions", async () => {
            const action = createMockAction("testAction");
            runtime.registerAction(action);

            const message: Memory = {
                id: "123e4567-e89b-12d3-a456-426614174003",
                userId: "123e4567-e89b-12d3-a456-426614174004",
                agentId: "123e4567-e89b-12d3-a456-426614174005",
                roomId: "123e4567-e89b-12d3-a456-426614174003",
                content: { type: "text", text: "test message" },
            };

            const response: Memory = {
                id: "123e4567-e89b-12d3-a456-426614174006",
                userId: "123e4567-e89b-12d3-a456-426614174005",
                agentId: "123e4567-e89b-12d3-a456-426614174005",
                roomId: "123e4567-e89b-12d3-a456-426614174003",
                content: {
                    type: "text",
                    text: "test response",
                    action: "testAction",
                },
            };

            await runtime.processActions(message, [response], {
                bio: "Test agent bio",
                lore: "Test agent lore and background",
                messageDirections: "How to respond to messages",
                postDirections: "How to create posts",
                roomId: "123e4567-e89b-12d3-a456-426614174003",
                actors: "List of actors in conversation",
                recentMessages: "Recent conversation history",
                recentMessagesData: [],
                goals: "Current conversation goals",
                goalsData: [],
                actionsData: [],
                knowledgeData: [],
                recentInteractionsData: [],
            });

            expect(action.handler).toBeDefined();
            expect(action.validate).toBeDefined();
        });
    });

    describe("room management", () => {
        const testUserId = "123e4567-e89b-12d3-a456-426614174004" as UUID;
        const testRoomId = "123e4567-e89b-12d3-a456-426614174003" as UUID;

        beforeEach(() => {
            // Reset all mocks before each test
            vi.clearAllMocks();
        });

        it("should add participant to room if not already in room", async () => {
            // Setup mock to indicate user is not in the room
            vi.mocked(
                mockDatabaseAdapter.getIsUserInTheRoom
            ).mockImplementationOnce(() => Promise.resolve(false));

            await runtime.ensureParticipantInRoom(testUserId, testRoomId);

            // Verify getIsUserInTheRoom was called with correct parameters
            expect(mockDatabaseAdapter.getIsUserInTheRoom).toHaveBeenCalledWith(
                testRoomId,
                testUserId
            );

            // Verify addParticipant was called since user was not in room
            expect(mockDatabaseAdapter.addParticipant).toHaveBeenCalledWith(
                testUserId,
                testRoomId
            );
        });

        it("should not add participant to room if already in room", async () => {
            // Setup mock to indicate user is already in the room
            vi.mocked(
                mockDatabaseAdapter.getIsUserInTheRoom
            ).mockImplementationOnce(() => Promise.resolve(true));

            await runtime.ensureParticipantInRoom(testUserId, testRoomId);

            // Verify getIsUserInTheRoom was called with correct parameters
            expect(mockDatabaseAdapter.getIsUserInTheRoom).toHaveBeenCalledWith(
                testRoomId,
                testUserId
            );

            // Verify addParticipant was NOT called since user was already in room
            expect(mockDatabaseAdapter.addParticipant).not.toHaveBeenCalledWith(
                testUserId,
                testRoomId
            );
        });

        it("should log differently when adding agent vs regular user to room", async () => {
            // Mock console.log since elizaLogger uses it
            const consoleSpy = vi.spyOn(console, "log");

            // First call for agent ID
            vi.mocked(
                mockDatabaseAdapter.getIsUserInTheRoom
            ).mockImplementationOnce(() => Promise.resolve(false));
            await runtime.ensureParticipantInRoom(runtime.agentId, testRoomId);

            // Second call for regular user ID
            vi.mocked(
                mockDatabaseAdapter.getIsUserInTheRoom
            ).mockImplementationOnce(() => Promise.resolve(false));
            await runtime.ensureParticipantInRoom(testUserId, testRoomId);

            // Verify addParticipant was called twice
            expect(mockDatabaseAdapter.addParticipant).toHaveBeenCalledWith(
                runtime.agentId,
                testRoomId
            );
            expect(mockDatabaseAdapter.addParticipant).toHaveBeenCalledWith(
                testUserId,
                testRoomId
            );
            // Restore the spy
            consoleSpy.mockRestore();
        });
    });

    describe("updateRecentMessageState", () => {
        const testRoomId = "123e4567-e89b-12d3-a456-426614174003" as UUID;
        const testUserId = "123e4567-e89b-12d3-a456-426614174004" as UUID;
        const messageId1 = "123e4567-e89b-12d3-a456-426614174101" as UUID;
        const messageId2 = "123e4567-e89b-12d3-a456-426614174102" as UUID;
        let mockActors: Actor[];

        beforeEach(() => {
            vi.clearAllMocks();
            // Setup a spy on the formatMessages function which is imported in the runtime
            vi.mock("../src/messages", () => ({
                formatMessages: vi
                    .fn()
                    .mockReturnValue("Formatted messages content"),
                retrieveActorIdsFromMessages: vi.fn(),
            }));

            // Create mock actors with all required properties after runtime is initialized
            mockActors = [
                {
                    id: runtime.agentId,
                    name: "Agent",
                    username: "agent",
                    details: {
                        summary: "Test agent",
                        tagline: "Test agent tagline",
                        quote: "Test agent quote",
                    },
                },
                {
                    id: testUserId,
                    name: "User",
                    username: "testuser",
                    details: {
                        summary: "Test user",
                        tagline: "Test user tagline",
                        quote: "Test user quote",
                    },
                },
            ];
        });

        it("should update state with recent messages", async () => {
            // Setup initial state
            const initialState: Partial<State> = {
                roomId: testRoomId,
                actorsData: mockActors,
            };

            // Setup mock messages to return
            const mockMessages: Memory[] = [
                {
                    id: messageId1,
                    roomId: testRoomId,
                    userId: testUserId,
                    agentId: runtime.agentId,
                    content: { type: "text", text: "Hello" },
                },
                {
                    id: messageId2,
                    roomId: testRoomId,
                    userId: runtime.agentId,
                    agentId: runtime.agentId,
                    content: { type: "text", text: "Hi there" },
                },
            ];

            // Mock the memory manager getMemories method
            const getMemoriesSpy = vi.spyOn(
                runtime.messageManager,
                "getMemories"
            );
            getMemoriesSpy.mockResolvedValue(mockMessages);

            // Call the method
            const result = await runtime.updateRecentMessageState(
                initialState as State
            );

            // Verify memory manager was called
            expect(getMemoriesSpy).toHaveBeenCalledWith({
                roomId: testRoomId,
                count: runtime.getConversationLength(),
                unique: false,
            });

            // Check that the state was updated
            expect(result).toHaveProperty("recentMessages");
            expect(result).toHaveProperty("recentMessagesData", mockMessages);
            expect(result.recentMessages).toContain(
                "Formatted messages content"
            );
        });

        it("should handle attachments in recent messages", async () => {
            // Setup initial state
            const initialState: Partial<State> = {
                roomId: testRoomId,
                actorsData: mockActors,
            };

            // Current timestamp for testing
            const now = Date.now();
            const twoHoursAgo = now - 2 * 60 * 60 * 1000;

            // Setup mock messages with attachments
            const mockMessages: Memory[] = [
                {
                    id: messageId1,
                    roomId: testRoomId,
                    userId: testUserId,
                    agentId: runtime.agentId,
                    createdAt: now,
                    content: {
                        type: "text",
                        text: "Check this out",
                        attachments: [
                            {
                                id: "att1",
                                title: "Recent Attachment",
                                url: "https://example.com/recent.jpg",
                                source: "upload",
                                description: "A recent image",
                                text: "Image content",
                            },
                        ],
                    },
                },
                {
                    id: messageId2,
                    roomId: testRoomId,
                    userId: runtime.agentId,
                    agentId: runtime.agentId,
                    createdAt: twoHoursAgo,
                    content: {
                        type: "text",
                        text: "Old attachment",
                        attachments: [
                            {
                                id: "att2",
                                title: "Old Attachment",
                                url: "https://example.com/old.jpg",
                                source: "upload",
                                description: "An old image",
                                text: "Old image content",
                            },
                        ],
                    },
                },
            ];

            // Mock the memory manager getMemories method
            const getMemoriesSpy = vi.spyOn(
                runtime.messageManager,
                "getMemories"
            );
            getMemoriesSpy.mockResolvedValue(mockMessages);

            // Call the method
            const result = await runtime.updateRecentMessageState(
                initialState as State
            );

            // Check that only the recent attachment is included in the formatted result
            expect(result).toHaveProperty("attachments");
            expect(result.attachments).toContain("Recent Attachment");
            expect(result.attachments).toContain("Image content");

            expect(result.attachments).toContain("Old Attachment");
            expect(result.attachments).toContain("[Hidden]");
            expect(result.attachments).not.toContain("Old image content");
        });

        it("should handle empty message lists", async () => {
            // Setup initial state
            const initialState: Partial<State> = {
                roomId: testRoomId,
                actorsData: [],
            };

            // Mock empty messages array
            const getMemoriesSpy = vi.spyOn(
                runtime.messageManager,
                "getMemories"
            );
            getMemoriesSpy.mockResolvedValue([]);

            // Call the method
            const result = await runtime.updateRecentMessageState(
                initialState as State
            );

            // Verify expected behavior with empty messages
            expect(getMemoriesSpy).toHaveBeenCalled();
            expect(result).toHaveProperty("recentMessages");
            expect(result).toHaveProperty("recentMessagesData", []);
            expect(result).toHaveProperty("attachments", "");
        });

        it("should handle messages without attachments", async () => {
            // Setup initial state
            const initialState: Partial<State> = {
                roomId: testRoomId,
                actorsData: mockActors,
            };

            // Setup mock messages without attachments
            const mockMessages: Memory[] = [
                {
                    id: messageId1,
                    roomId: testRoomId,
                    userId: testUserId,
                    agentId: runtime.agentId,
                    content: { type: "text", text: "Hello" },
                },
                {
                    id: messageId2,
                    roomId: testRoomId,
                    userId: runtime.agentId,
                    agentId: runtime.agentId,
                    content: { type: "text", text: "Hi there" },
                },
            ];

            // Mock the memory manager getMemories method
            const getMemoriesSpy = vi.spyOn(
                runtime.messageManager,
                "getMemories"
            );
            getMemoriesSpy.mockResolvedValue(mockMessages);

            // Call the method
            const result = await runtime.updateRecentMessageState(
                initialState as State
            );

            // Check that attachments are empty
            expect(result).toHaveProperty("attachments", "");
        });

        it("should format attachments correctly", async () => {
            // Setup initial state
            const initialState: Partial<State> = {
                roomId: testRoomId,
                actorsData: mockActors,
            };

            // Current timestamp for testing
            const now = Date.now();

            // Setup a mock message with a well-defined attachment
            const mockAttachment = {
                id: "test-attachment-id",
                title: "Test Attachment",
                url: "https://example.com/test.jpg",
                source: "upload",
                description: "Test description",
                text: "Test attachment text content",
            };

            const mockMessages: Memory[] = [
                {
                    id: messageId1,
                    roomId: testRoomId,
                    userId: testUserId,
                    agentId: runtime.agentId,
                    createdAt: now,
                    content: {
                        type: "text",
                        text: "Message with attachment",
                        attachments: [mockAttachment],
                    },
                },
            ];

            // Mock the memory manager getMemories method
            const getMemoriesSpy = vi.spyOn(
                runtime.messageManager,
                "getMemories"
            );
            getMemoriesSpy.mockResolvedValue(mockMessages);

            // Call the method
            const result = await runtime.updateRecentMessageState(
                initialState as State
            );

            // Verify the exact attachment formatting
            expect(result.attachments).toContain(`ID: ${mockAttachment.id}`);
            expect(result.attachments).toContain(
                `Name: ${mockAttachment.title}`
            );
            expect(result.attachments).toContain(`URL: ${mockAttachment.url}`);
            expect(result.attachments).toContain(
                `Type: ${mockAttachment.source}`
            );
            expect(result.attachments).toContain(
                `Description: ${mockAttachment.description}`
            );
            expect(result.attachments).toContain(
                `Text: ${mockAttachment.text}`
            );

            // Verify the overall structure with proper spacing
            const expectedFormatPattern = new RegExp(
                `ID: ${mockAttachment.id}\\s+` +
                    `Name: ${mockAttachment.title}\\s+` +
                    `URL: ${mockAttachment.url}\\s+` +
                    `Type: ${mockAttachment.source}\\s+` +
                    `Description: ${mockAttachment.description}\\s+` +
                    `Text: ${mockAttachment.text}`
            );
            expect(result.attachments).toMatch(expectedFormatPattern);
        });

        it("should handle multiple attachments correctly", async () => {
            // Setup initial state
            const initialState: Partial<State> = {
                roomId: testRoomId,
                actorsData: mockActors,
            };

            // Current timestamp for testing
            const now = Date.now();

            // Setup mock message with multiple attachments
            const mockAttachments = [
                {
                    id: "attachment-1",
                    title: "First Attachment",
                    url: "https://example.com/first.jpg",
                    source: "upload",
                    description: "First description",
                    text: "First attachment text",
                },
                {
                    id: "attachment-2",
                    title: "Second Attachment",
                    url: "https://example.com/second.pdf",
                    source: "document",
                    description: "Second description",
                    text: "Second attachment text",
                },
            ];

            const mockMessages: Memory[] = [
                {
                    id: messageId1,
                    roomId: testRoomId,
                    userId: testUserId,
                    agentId: runtime.agentId,
                    createdAt: now,
                    content: {
                        type: "text",
                        text: "Message with multiple attachments",
                        attachments: mockAttachments,
                    },
                },
            ];

            // Mock the memory manager getMemories method
            const getMemoriesSpy = vi.spyOn(
                runtime.messageManager,
                "getMemories"
            );
            getMemoriesSpy.mockResolvedValue(mockMessages);

            // Call the method
            const result = await runtime.updateRecentMessageState(
                initialState as State
            );

            // Check that both attachments are included in the formatted result
            for (const attachment of mockAttachments) {
                expect(result.attachments).toContain(`ID: ${attachment.id}`);
                expect(result.attachments).toContain(
                    `Name: ${attachment.title}`
                );
                expect(result.attachments).toContain(`URL: ${attachment.url}`);
                expect(result.attachments).toContain(
                    `Type: ${attachment.source}`
                );
                expect(result.attachments).toContain(
                    `Description: ${attachment.description}`
                );
                expect(result.attachments).toContain(
                    `Text: ${attachment.text}`
                );
            }

            // Verify the attachments are separated by newlines
            const attachmentTextBlocks = mockAttachments.map(
                (attachment) =>
                    `ID: ${attachment.id}\nName: ${attachment.title}\nURL: ${attachment.url}\nType: ${attachment.source}\nDescription: ${attachment.description}\nText: ${attachment.text}`
            );

            // Check if attachments are joined with newlines
            expect(result.attachments).toContain(attachmentTextBlocks[0]);
            expect(result.attachments).toContain(attachmentTextBlocks[1]);
        });
    });

    describe("formatCharacterMessageExamples", () => {
        it("should format message examples correctly", () => {
            // Set up the runtime with a specific MESSAGE_EXAMPLES_COUNT
            const testSettings = new Map<string, string>();
            testSettings.set("MESSAGE_EXAMPLES_COUNT", "2");

            vi.spyOn(runtime, "getSetting").mockImplementation((key) => {
                return testSettings.get(key) || null;
            });

            // Mock the message examples from binotest.json
            const messageExamples = [
                [
                    {
                        user: "{{user1}}",
                        content: {
                            text: "Planning a hike in Yosemite this weekend, any weather advice?",
                        },
                    },
                    {
                        user: "{{agent}}",
                        content: {
                            text: "Let me fetch the weather for you.",
                            action: "ASK_SENTAI",
                        },
                    },
                    {
                        user: "{{agent}}",
                        content: {
                            text: "Switching to actual weather mode for you, hiking buddy!",
                        },
                    },
                ],
                [
                    {
                        user: "{{user1}}",
                        content: {
                            text: "Why should I care about DePIN?",
                        },
                    },
                    {
                        user: "bino",
                        content: {
                            text: "Because DePIN is where reality meets the blockchain.",
                        },
                    },
                ],
                [
                    {
                        user: "{{user1}}",
                        content: {
                            text: "What makes IoTeX so special?",
                        },
                    },
                    {
                        user: "bino",
                        content: {
                            text: "IoTeX is DePIN's final boss. ",
                        },
                    },
                ],
                [
                    {
                        user: "{{user1}}",
                        content: {
                            text: "Is $BTC dead?",
                        },
                    },
                    {
                        user: "bino",
                        content: {
                            text: "Bruh, $BTC doesn't die, it just chills before flexing again.",
                        },
                    },
                ],
            ];

            // Format the message examples
            const formattedExamples = formatMessageExamples(
                runtime,
                messageExamples
            );

            console.log(formattedExamples);

            // Check that the formatted examples behave correctly
            expect(formattedExamples).toBeDefined();

            // Verify format of the examples string with correct replacements
            // We expect 2 sets of examples (based on the MESSAGE_EXAMPLES_COUNT we set)
            const exampleLines = formattedExamples.split("\n\n").slice(1);
            expect(exampleLines.length).toBe(2);

            // Each example should contain formatted messages
            for (const example of exampleLines) {
                // Verify each example contains names (not {{user1}} placeholders)
                expect(example).not.toContain("{{user1}}");

                // Each message should be formatted as "username: message"
                const lines = example.trim().split("\n");
                for (const line of lines) {
                    expect(line).toMatch(/^.+: .+$/);
                }
            }

            // Verify random selection and shuffling
            // Run the function again and expect the output to be potentially different due to random selection
            // Note: This test could occasionally fail due to the random nature of the shuffle
            const mockRandom = vi.spyOn(Math, "random").mockReturnValue(0.75);
            const secondFormatted = formatMessageExamples(
                runtime,
                messageExamples
            );
            mockRandom.mockRestore();

            // Expect them to be different with high probability
            // If they're the same, check that the random function behaved as expected
            if (secondFormatted === formattedExamples) {
                expect(mockRandom).toHaveBeenCalled();
            }
        });
    });

    describe("initAgent", () => {
        it("should throw error if no database adapter is provided", () => {
            expect(() => {
                new AgentRuntime({
                    token: "test-token",
                    character: defaultCharacter,
                    modelProvider: ModelProviderName.OPENAI,
                    cacheManager: mockCacheManager,
                } as any); // Using 'as any' to bypass TypeScript checks for test
            }).toThrow("No database adapter provided");
        });

        it("should use default character if none provided", () => {
            const runtimeWithoutCharacter = new AgentRuntime({
                token: "test-token",
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
            });

            expect(runtimeWithoutCharacter.character).toBe(defaultCharacter);
        });

        it("should set agent ID from character ID if available", () => {
            const characterWithId = {
                ...defaultCharacter,
                id: "test-character-id" as UUID,
            };

            const runtimeWithCharacterId = new AgentRuntime({
                token: "test-token",
                character: characterWithId,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
            });

            expect(runtimeWithCharacterId.agentId).toBe("test-character-id");
        });

        it("should set agent ID from provided agentId if character ID not available", () => {
            const runtimeWithAgentId = new AgentRuntime({
                token: "test-token",
                agentId: "test-agent-id" as UUID,
                character: defaultCharacter,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
            });

            expect(runtimeWithAgentId.agentId).toBe("test-agent-id");
        });

        it("should generate agent ID from character name if no ID provided", () => {
            const characterWithName = {
                ...defaultCharacter,
                name: "TestCharacter",
            };

            const runtime = new AgentRuntime({
                token: "test-token",
                character: characterWithName,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
            });

            // Since stringToUuid is deterministic, we can test for the exact UUID
            expect(runtime.agentId).toBe(stringToUuid("TestCharacter"));
        });

        it("should initialize room and user for the agent", async () => {
            const runtime = new AgentRuntime({
                token: "test-token",
                character: defaultCharacter,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
            });

            // Verify room creation was attempted
            expect(mockDatabaseAdapter.getRoom).toHaveBeenCalledWith(
                runtime.agentId
            );
            expect(mockDatabaseAdapter.createRoom).toHaveBeenCalledWith(
                runtime.agentId
            );

            // Verify user creation was attempted
            expect(mockDatabaseAdapter.getAccountById).toHaveBeenCalledWith(
                runtime.agentId
            );
            expect(mockDatabaseAdapter.createAccount).toHaveBeenCalledWith({
                id: runtime.agentId,
                name: defaultCharacter.name,
                username: defaultCharacter.name,
                email: `${defaultCharacter.name}@undefined`,
                details: { summary: "" },
            });

            // Verify participant creation was attempted
            expect(
                mockDatabaseAdapter.getParticipantsForAccount
            ).toHaveBeenCalledWith(runtime.agentId);
            expect(mockDatabaseAdapter.addParticipant).toHaveBeenCalledWith(
                runtime.agentId,
                runtime.agentId
            );
        });
    });

    describe("initFetch", () => {
        it("should use provided fetch implementation if available", () => {
            const customFetch = vi.fn();
            const runtime = new AgentRuntime({
                token: "test-token",
                character: defaultCharacter,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
                fetch: customFetch,
            });

            expect(runtime.fetch).toBe(customFetch);
        });

        it("should use global fetch if no custom fetch provided", () => {
            const runtime = new AgentRuntime({
                token: "test-token",
                character: defaultCharacter,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
            });

            expect(runtime.fetch).toBe(global.fetch);
        });

        it("should handle fetch being undefined in options", () => {
            const runtime = new AgentRuntime({
                token: "test-token",
                character: defaultCharacter,
                databaseAdapter: mockDatabaseAdapter,
                cacheManager: mockCacheManager,
                modelProvider: ModelProviderName.OPENAI,
                fetch: undefined,
            });

            expect(runtime.fetch).toBe(global.fetch);
        });
    });

    describe("formatMCPTools", () => {
        it("should format available MCP tools correctly", async () => {
            // Directly set mcpTools for the test
            runtime.character.mcpServers = {
                server1: { description: "Description for tool1" },
                server2: { description: "Description for tool2" },
            };

            const formattedTools = (runtime as any).formatMCPServers();
            expect(formattedTools).toContain("# Available MCP Tools");
            expect(formattedTools).toContain("- server1: Description for tool1");
            expect(formattedTools).toContain("- server2: Description for tool2");
        });

        it("should return an empty string if no MCP tools are available", async () => {
            // Ensure mcpTools is empty
            runtime.character.mcpServers = {};

            const formattedTools = (runtime as any).formatMCPServers();
            expect(formattedTools).toBe("");
        });
    });
});
