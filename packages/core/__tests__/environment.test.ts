import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv, validateCharacterConfig } from "../src/environment";
import { Clients, ModelProviderName } from "../src/types";

describe("Environment Configuration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            OPENAI_API_KEY: "sk-test123",
            REDPILL_API_KEY: "test-key",
            GROK_API_KEY: "test-key",
            GROQ_API_KEY: "gsk_test123",
            OPENROUTER_API_KEY: "test-key",
            GOOGLE_GENERATIVE_AI_API_KEY: "test-key",
            ELEVENLABS_XI_API_KEY: "test-key",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("should validate correct environment variables", () => {
        expect(() => validateEnv()).not.toThrow();
    });

    it("should throw error for invalid OpenAI API key format", () => {
        process.env.OPENAI_API_KEY = "invalid-key";
        expect(() => validateEnv()).toThrow(
            "OpenAI API key must start with 'sk-'"
        );
    });

    it("should throw error for missing required keys", () => {
        delete process.env.OPENAI_API_KEY;
        expect(() => validateEnv()).toThrow("OPENAI_API_KEY: Required");
    });

    it("should throw error for multiple missing required keys", () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.GROK_API_KEY;
        expect(() => validateEnv()).toThrow(
            "Environment validation failed:\n" +
                "OPENAI_API_KEY: Required\n" +
                "GROK_API_KEY: Required"
        );
    });
});

describe("Character Configuration", () => {
    const validCharacterConfig = {
        name: "Test Character",
        modelProvider: ModelProviderName.OPENAI,
        bio: "Test bio",
        lore: ["Test lore"],
        messageExamples: [
            [
                {
                    user: "user1",
                    content: {
                        text: "Hello",
                    },
                },
            ],
        ],
        postExamples: ["Test post"],
        topics: ["topic1"],
        adjectives: ["friendly"],
        clients: [Clients.DISCORD],
        plugins: ["test-plugin"],
        style: {
            all: ["style1"],
            chat: ["chat-style"],
            post: ["post-style"],
        },
    };

    it("should validate correct character configuration", () => {
        expect(() =>
            validateCharacterConfig(validCharacterConfig)
        ).not.toThrow();
    });

    it("should validate configuration with optional fields", () => {
        const configWithOptionals = {
            ...validCharacterConfig,
            id: "123e4567-e89b-12d3-a456-426614174000",
            system: "Test system",
            templates: {
                greeting: "Hello!",
            },
            knowledge: ["fact1"],
            settings: {
                secrets: {
                    key: "value",
                },
                voice: {
                    model: "test-model",
                    url: "http://example.com",
                },
            },
        };
        expect(() =>
            validateCharacterConfig(configWithOptionals)
        ).not.toThrow();
    });

    it("should throw error for missing required fields", () => {
        const invalidConfig = { ...validCharacterConfig };
        delete (invalidConfig as any).name;
        expect(() => validateCharacterConfig(invalidConfig)).toThrow();
    });

    it("should validate plugin objects in plugins array", () => {
        const configWithPluginObjects = {
            ...validCharacterConfig,
            plugins: [
                {
                    name: "test-plugin",
                    description: "Test description",
                },
            ],
        };
        expect(() =>
            validateCharacterConfig(configWithPluginObjects)
        ).not.toThrow();
    });

    it("should validate client-specific configurations", () => {
        const configWithClientConfig = {
            ...validCharacterConfig,
            clientConfig: {
                discord: {
                    shouldIgnoreBotMessages: true,
                    shouldIgnoreDirectMessages: false,
                },
                telegram: {
                    shouldIgnoreBotMessages: true,
                    shouldIgnoreDirectMessages: true,
                },
            },
        };
        expect(() =>
            validateCharacterConfig(configWithClientConfig)
        ).not.toThrow();
    });

    it("should validate twitter profile configuration", () => {
        const configWithTwitter = {
            ...validCharacterConfig,
            twitterProfile: {
                username: "testuser",
                screenName: "Test User",
                bio: "Test bio",
                nicknames: ["test"],
            },
        };
        expect(() => validateCharacterConfig(configWithTwitter)).not.toThrow();
    });

    it("should validate model endpoint override", () => {
        const configWithEndpoint = {
            ...validCharacterConfig,
            modelEndpointOverride: "custom-endpoint",
        };
        expect(() => validateCharacterConfig(configWithEndpoint)).not.toThrow();
    });

    it("should validate message examples with additional properties", () => {
        const configWithComplexMessage = {
            ...validCharacterConfig,
            messageExamples: [
                [
                    {
                        user: "user1",
                        content: {
                            text: "Hello",
                            action: "wave",
                            source: "chat",
                            url: "http://example.com",
                            inReplyTo: "123e4567-e89b-12d3-a456-426614174000",
                            attachments: ["file1"],
                            customField: "value",
                        },
                    },
                ],
            ],
        };
        expect(() =>
            validateCharacterConfig(configWithComplexMessage)
        ).not.toThrow();
    });

    it("should validate mcpServers with command and args", () => {
        const configWithMcpCommand = {
            ...validCharacterConfig,
            mcpServers: {
                "server-one": {
                    description: "Test description",
                    command: "test-command",
                    args: ["arg1", "arg2"],
                },
            },
        };
        expect(() =>
            validateCharacterConfig(configWithMcpCommand)
        ).not.toThrow();
    });

    it("should validate mcpServers with url", () => {
        const configWithMcpUrl = {
            ...validCharacterConfig,
            mcpServers: {
                "server-two": {
                    description: "Test description",
                    url: "http://localhost:8080",
                },
            },
        };
        expect(() => validateCharacterConfig(configWithMcpUrl)).not.toThrow();
    });

    it("should throw error for invalid mcpServers configuration (missing command/args/url)", () => {
        const configWithInvalidMcp = {
            ...validCharacterConfig,
            mcpServers: {
                "invalid-server": {},
            },
        };
        expect(() => validateCharacterConfig(configWithInvalidMcp)).toThrow();
    });

    it("should throw error for mcpServers configuration with both command/args and url", () => {
        const configWithBothMcp = {
            ...validCharacterConfig,
            mcpServers: {
                "server-three": {
                    command: "test-command",
                    args: ["arg1", "arg2"],
                    url: "http://localhost:8080",
                },
            },
        };
        expect(() => validateCharacterConfig(configWithBothMcp)).toThrow();
    });

    it("should validate collaborators configuration", () => {
        const configWithCollaborators = {
            ...validCharacterConfig,
            collaborators: [
                {
                    name: "Agent1",
                    url: "https://test.example.com/agent1",
                    expertise: "Weather",
                },
                {
                    name: "Agent2",
                    url: "https://test.example.com/agent2",
                    expertise: "Sports",
                },
            ],
        };
        expect(() =>
            validateCharacterConfig(configWithCollaborators)
        ).not.toThrow();
    });

    it("should validate empty collaborators array", () => {
        const configWithEmptyCollaborators = {
            ...validCharacterConfig,
            collaborators: [],
        };
        expect(() =>
            validateCharacterConfig(configWithEmptyCollaborators)
        ).not.toThrow();
    });

    it("should throw error for collaborator missing required fields", () => {
        const configWithInvalidCollaborator = {
            ...validCharacterConfig,
            collaborators: [
                {
                    name: "IncompleteAgent",
                    // Missing url and expertise
                },
            ],
        };
        expect(() =>
            validateCharacterConfig(configWithInvalidCollaborator)
        ).toThrow();
    });

    it("should throw error for collaborator with invalid field types", () => {
        const configWithInvalidTypes = {
            ...validCharacterConfig,
            collaborators: [
                {
                    name: 123, // Should be string
                    url: "https://example.com",
                    expertise: "Test",
                },
            ],
        };
        expect(() => validateCharacterConfig(configWithInvalidTypes)).toThrow();
    });
});
