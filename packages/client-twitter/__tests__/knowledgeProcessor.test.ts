import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeProcessor } from "../src/KnowledgeProcessor";
import { SearchMode } from "agent-twitter-client";
import { IAgentRuntime, ServiceType } from "@elizaos/core";

// Define the tweet interface for proper typing
interface MockTweet {
    id: string;
    username: string;
    name: string;
    text: string;
    timestamp: number;
    permanentUrl: string;
    photos: Array<{ url: string }>;
}

// Mock core dependencies
vi.mock("@elizaos/core", async () => {
    return {
        elizaLogger: {
            log: vi.fn(),
            error: vi.fn(),
        },
        composeContext: vi.fn().mockReturnValue(""),
        stringToUuid: vi.fn((str) => `uuid-${str}`),
        generateObject: vi.fn().mockResolvedValue({
            object: {
                analysis: [
                    {
                        tweetId: "123",
                        summary: "A high relevance tweet",
                        knowledgePoints: ["Point 1", "Point 2"],
                        mediaInsights: ["Media insight 1"],
                        topics: ["Tech", "AI"],
                        relevanceScore: 0.8,
                    },
                    {
                        tweetId: "456",
                        summary: "A low relevance tweet",
                        knowledgePoints: [],
                        mediaInsights: [],
                        topics: ["Random"],
                        relevanceScore: 0.3,
                    },
                    {
                        summary:
                            "This tweet is a general greeting to the DePIN community, promoting decentralized innovation and connection.",
                        relevanceScore: 0.5,
                        tweetId: "789",
                        knowledgePoints:
                            "The tweet uses hashtags #Web3, #DePIN, #Growth, and #DePIN25, indicating a focus on Web3 and decentralized physical infrastructure networks,",
                    },
                    {
                        knowledgePoints: "N/A",
                        relevanceScore: 0,
                        tweetId: "1234",
                        summary:
                            "This tweet is a reply to another user and contains only an informal interjection ('ERTI!!'). It is not informative.",
                    },
                ],
            },
        }),
        ServiceType: { IMAGE_DESCRIPTION: "IMAGE_DESCRIPTION" },
        ModelClass: { SMALL: "SMALL" },
    };
});

describe("KnowledgeProcessor", () => {
    let processor: KnowledgeProcessor;
    let mockRuntime: IAgentRuntime;
    let mockClient: any;
    let mockTwitterClient: any;
    let mockImageDescription: any;

    function createMockTweet(
        id: number,
        username: string,
        text: string,
        hasPhotos = false
    ): MockTweet {
        return {
            id: id.toString(),
            username,
            name: `${username}_fullname`,
            text,
            timestamp: Math.floor(Date.now() / 1000) - 60 * 60, // 1 hour ago
            permanentUrl: `https://twitter.com/${username}/status/${id}`,
            photos: hasPhotos
                ? [{ url: `https://example.com/image${id}.jpg` }]
                : [],
        };
    }

    beforeEach(() => {
        // Create mock for image description service
        mockImageDescription = {
            describeImage: vi.fn().mockResolvedValue({
                title: "Test Image",
                description: "A description of the test image",
            }),
        };

        // Mock runtime
        mockRuntime = {
            agentId: "test-agent-id",
            getService: vi.fn().mockImplementation((serviceType) => {
                if (serviceType === ServiceType.IMAGE_DESCRIPTION) {
                    return mockImageDescription;
                }
                return null;
            }),
            ragKnowledgeManager: {
                createKnowledge: vi.fn().mockResolvedValue({}),
                checkExistingKnowledge: vi.fn().mockResolvedValue(false),
            },
        } as unknown as IAgentRuntime;

        // Mock Twitter client
        mockTwitterClient = {
            fetchSearchTweets: vi.fn(),
        };

        // Mock client
        mockClient = {
            twitterConfig: {
                TWITTER_KNOWLEDGE_USERS: ["testuser", "anotheruser"],
            },
            twitterClient: mockTwitterClient,
            lastCheckedTweetId: null,
        };

        // Create processor instance
        processor = new KnowledgeProcessor(mockRuntime, mockClient);

        // Reset mocks between tests
        vi.clearAllMocks();
    });

    it("should not process knowledge when no knowledge users configured", async () => {
        // Override the twitterConfig to have empty knowledge users
        mockClient.twitterConfig.TWITTER_KNOWLEDGE_USERS = [];

        await processor.processKnowledge();

        // Verify that fetchSearchTweets was not called
        expect(mockTwitterClient.fetchSearchTweets).not.toHaveBeenCalled();
    });

    it("should process knowledge tweets from configured users", async () => {
        // Setup mock tweets with only one tweet - this will ensure we only process one batch
        const mockTweets = [
            createMockTweet(
                123,
                "testuser",
                "This is a test tweet with high relevance",
                true
            ),
        ];

        // Configure our mock to only call fetchSearchTweets once for a single user to prevent multiple batches
        mockTwitterClient.fetchSearchTweets
            .mockResolvedValueOnce({
                tweets: mockTweets,
            })
            .mockResolvedValue({ tweets: [] }); // Any subsequent calls return empty tweets

        await processor.processKnowledge();

        // Verify tweet fetching
        expect(mockTwitterClient.fetchSearchTweets).toHaveBeenCalledWith(
            "from:testuser",
            10,
            SearchMode.Latest
        );

        // Only the high relevance tweet (with ID 123) should result in knowledge creation
        // Exactly one call should be made
        expect(
            mockRuntime.ragKnowledgeManager.createKnowledge
        ).toHaveBeenCalledTimes(1);
        expect(
            mockRuntime.ragKnowledgeManager.createKnowledge
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    metadata: expect.objectContaining({
                        relevanceScore: 0.8,
                        tweetId: "123",
                    }),
                }),
            }),
            "twitter",
            false
        );
    });

    it("should filter out tweets based on lastCheckedTweetId", async () => {
        // Set a lastCheckedTweetId
        mockClient.lastCheckedTweetId = 200;

        // Setup tweets - one older, one newer than lastCheckedTweetId
        const mockTweets = [
            createMockTweet(123, "testuser", "This is an old tweet"), // ID < lastCheckedTweetId
            createMockTweet(
                300,
                "testuser",
                "This is a new tweet with photo",
                true
            ), // ID > lastCheckedTweetId
        ];

        mockTwitterClient.fetchSearchTweets.mockResolvedValue({
            tweets: mockTweets,
        });

        await processor.processKnowledge();

        // Verify that the image service was called for the newer tweet
        // The newer tweet has a photo, so image description service should be called
        expect(mockImageDescription.describeImage).toHaveBeenCalledWith(
            "https://example.com/image300.jpg"
        );
    });

    it("should process image descriptions for tweets with photos", async () => {
        // Setup tweets with photos
        const mockTweets = [
            createMockTweet(123, "testuser", "Tweet with photo", true),
        ];

        mockTwitterClient.fetchSearchTweets.mockResolvedValue({
            tweets: mockTweets,
        });

        await processor.processKnowledge();

        // Verify image description was requested
        expect(mockImageDescription.describeImage).toHaveBeenCalledWith(
            "https://example.com/image123.jpg"
        );
    });

    it("should handle errors during tweet processing", async () => {
        // Setup error when fetching tweets
        mockTwitterClient.fetchSearchTweets.mockRejectedValueOnce(
            new Error("API error")
        );

        // Process should complete without throwing
        await expect(processor.processKnowledge()).resolves.not.toThrow();
    });

    it("should process tweets in batches of 5", async () => {
        // Create 7 tweets to test batch processing (5 + 2)
        const mockTweets: MockTweet[] = [];
        for (let i = 1; i <= 7; i++) {
            // Create tweets with different IDs
            const tweet = createMockTweet(100 + i, "testuser", `Tweet ${i}`);
            // Make one of these tweets have a high relevance score to ensure knowledge creation
            if (i === 3) {
                tweet.id = "123"; // This ID matches our mock generateObject response with high relevance
            }
            mockTweets.push(tweet);
        }

        mockTwitterClient.fetchSearchTweets.mockResolvedValue({
            tweets: mockTweets,
        });

        await processor.processKnowledge();

        // With a relevant tweet in the batch, knowledge creation should be called
        expect(
            mockRuntime.ragKnowledgeManager.createKnowledge
        ).toHaveBeenCalled();
    });

    it("should handle errors during image description", async () => {
        // Setup tweets with photos
        const mockTweets = [
            createMockTweet(
                123,
                "testuser",
                "Tweet with photo that fails processing",
                true
            ),
        ];

        mockTwitterClient.fetchSearchTweets.mockResolvedValue({
            tweets: mockTweets,
        });

        // Make image description throw an error
        mockImageDescription.describeImage.mockRejectedValueOnce(
            new Error("Image processing error")
        );

        // Process should complete without throwing
        await expect(processor.processKnowledge()).resolves.not.toThrow();
    });

    it("should skip old tweets", async () => {
        // Create an old tweet (more than 3 days old)
        const oldTweet = createMockTweet(123, "testuser", "Old tweet");
        oldTweet.timestamp = Math.floor(Date.now() / 1000) - 4 * 24 * 60 * 60; // 4 days old

        mockTwitterClient.fetchSearchTweets.mockResolvedValue({
            tweets: [oldTweet],
        });

        await processor.processKnowledge();

        // Expect no knowledge creation
        expect(
            mockRuntime.ragKnowledgeManager.createKnowledge
        ).not.toHaveBeenCalled();
    });
});
