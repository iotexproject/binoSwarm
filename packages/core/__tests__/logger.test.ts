import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ElizaLogger } from "../src/logger";

describe("ElizaLogger", () => {
    let logger: ElizaLogger;
    let consoleSpy: {
        log: ReturnType<typeof vi.spyOn>;
        group: ReturnType<typeof vi.spyOn>;
        groupEnd: ReturnType<typeof vi.spyOn>;
    };

    beforeEach(() => {
        // Create a new logger instance for each test
        logger = new ElizaLogger();
        logger.useStructuredLogs = true;

        // Mock console methods to capture output
        consoleSpy = {
            log: vi.spyOn(console, "log").mockImplementation(() => {}),
            group: vi.spyOn(console, "group").mockImplementation(() => {}),
            groupEnd: vi
                .spyOn(console, "groupEnd")
                .mockImplementation(() => {}),
        };
    });

    afterEach(() => {
        // Clean up after each test
        vi.restoreAllMocks();
    });

    describe("Constructor", () => {
        it("should initialize with correct default values", () => {
            expect(logger.verbose).toBeDefined();
            expect(logger.closeByNewLine).toBe(true);
            expect(logger.useIcons).toBe(true);
            expect(logger.useStructuredLogs).toBe(true);
        });
    });

    describe("Log Levels with Structured Logging", () => {
        const testMessage = "Test message";

        it("should log at info level", () => {
            logger.log(testMessage);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.level).toBe("info");
            expect(loggedContent.message).toBe(testMessage);
            expect(loggedContent.timestamp).toBeDefined();
        });

        it("should log at error level", () => {
            logger.error(testMessage);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.level).toBe("error");
            expect(loggedContent.message).toBe(testMessage);
        });

        it("should log at warn level", () => {
            logger.warn(testMessage);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.level).toBe("warn");
            expect(loggedContent.message).toBe(testMessage);
        });

        it("should log at debug level when verbose is true", () => {
            logger.verbose = true;
            logger.debug(testMessage);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.level).toBe("debug");
            expect(loggedContent.message).toBe(testMessage);
        });

        it("should not log at debug level when verbose is false", () => {
            logger.verbose = false;
            logger.debug(testMessage);

            expect(consoleSpy.log).not.toHaveBeenCalled();
        });

        it("should log at success level", () => {
            logger.success(testMessage);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.level).toBe("success");
            expect(loggedContent.message).toBe(testMessage);
        });

        it("should log at assert level", () => {
            logger.assert(testMessage);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.level).toBe("assert");
            expect(loggedContent.message).toBe(testMessage);
        });
    });

    describe("Log Content Formatting", () => {
        it("should correctly format string messages", () => {
            const message = "Simple string message";
            logger.info(message);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.message).toBe(message);
        });

        it("should correctly format object messages", () => {
            const messageObject = { key: "value", nested: { foo: "bar" } };
            logger.info(messageObject);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.message).toBe("");
            expect(loggedContent.data_0).toBeUndefined(); // Should not use data_0 for first param
            expect(JSON.parse(JSON.stringify(loggedContent))).toMatchObject(
                expect.objectContaining({ key: "value" })
            );
        });

        it("should correctly handle multiple parameters", () => {
            const message = "Main message";
            const additionalData = { userId: 123 };
            const extraInfo = "Extra info";

            logger.info(message, additionalData, extraInfo);

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.message).toBe(message);
            expect(loggedContent.data_0).toEqual(additionalData);
            expect(loggedContent.data_1).toBe(extraInfo);
        });
    });

    describe("Log Labels", () => {
        it("should add custom labels to logs", () => {
            logger.setLogLabels({ component: "test", env: "testing" });
            logger.info("Test with labels");

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.component).toBe("test");
            expect(loggedContent.env).toBe("testing");
        });

        it("should merge new labels with existing ones", () => {
            logger.setLogLabels({ component: "test" });
            logger.setLogLabels({ env: "testing" });
            logger.info("Test with merged labels");

            // @ts-ignore
            const loggedContent = JSON.parse(consoleSpy.log.mock.calls[0][0]);
            expect(loggedContent.component).toBe("test");
            expect(loggedContent.env).toBe("testing");
        });
    });
});
