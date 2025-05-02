import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Metering } from "../src/metering";
import { stringToUuid } from "../src/uuid";
import { MeteringEvent } from "../src/types";

describe("Metering", () => {
    let metering: Metering;
    let fetchMock: any;

    beforeEach(() => {
        // Mock the fetch function
        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });

        global.fetch = fetchMock;

        const originalSubject = process.env.OPENMETER_SUBJECT;
        const originalApiKey = process.env.OPENMETER_API_KEY;
        const originalApiUrl = process.env.OPENMETER_API_URL;

        process.env.OPENMETER_SUBJECT = "test-customer";
        process.env.OPENMETER_API_KEY = "test-api-key";
        process.env.OPENMETER_API_URL = "https://test-api.example.com/v1";

        metering = new Metering({
            source: "test-source",
        });

        if (!originalSubject) delete process.env.OPENMETER_SUBJECT;
        else process.env.OPENMETER_SUBJECT = originalSubject;

        if (!originalApiKey) delete process.env.OPENMETER_API_KEY;
        else process.env.OPENMETER_API_KEY = originalApiKey;

        if (!originalApiUrl) delete process.env.OPENMETER_API_URL;
        else process.env.OPENMETER_API_URL = originalApiUrl;
    });

    afterEach(() => {
        metering.dispose();
        vi.resetAllMocks();
    });

    it("should configure with default options", () => {
        const defaultMetering = new Metering({
            source: "test-source",
        });
        expect(defaultMetering).toBeDefined();
    });

    it("should create a correctly formatted event", () => {
        const event = metering.createEvent({
            type: "test-event",
            data: { value: 123 },
        });

        expect(event).toMatchObject({
            specversion: "1.0",
            type: "test-event",
            source: "test-source",
            subject: "test-customer",
            data: { value: 123 },
        });

        expect(event.id).toBeDefined();
        expect(event.time).toBeDefined();
    });

    it("should track an event and add it to queue", async () => {
        // Reset mock to ensure clean state
        fetchMock.mockClear();

        // Save original API key and set test value
        const savedApiKey = process.env.OPENMETER_API_KEY;
        process.env.OPENMETER_API_KEY = "test-api-key";

        const testId = stringToUuid("test-id");

        const testEvent: MeteringEvent = {
            specversion: "1.0",
            type: "test-event",
            id: testId,
            time: new Date().toISOString(),
            source: "test-source",
            subject: "test-customer",
            data: { value: 123 },
        };

        metering.track(testEvent);

        // Trigger flush to check the queue contents
        await metering.flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://test-api.example.com/v1/events"
        );
        expect(fetchMock.mock.calls[0][1].method).toBe("POST");
        expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
            "application/cloudevents+json"
        );
        expect(fetchMock.mock.calls[0][1].headers["Authorization"]).toBe(
            "Bearer test-api-key"
        );

        const sentData = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(sentData.id).toBe(testId);
        expect(sentData.type).toBe("test-event");

        // Restore original API key
        process.env.OPENMETER_API_KEY = savedApiKey;
    });

    it("should provide a convenience method for tracking prompts", () => {
        metering.trackPrompt({
            tokens: 456,
            model: "gpt4o",
            type: "input",
        });

        // Trigger flush to check the queue contents
        metering.flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        const callArgs = fetchMock.mock.calls[0];
        const payload = JSON.parse(callArgs[1].body);

        expect(payload.type).toBe("prompt");
        expect(payload.source).toBe("test-source");
        expect(payload.subject).toBe("test-customer");
        expect(payload.data).toEqual({
            tokens: "456",
            model: "gpt4o",
            type: "input",
        });
    });

    it("should handle API errors", async () => {
        // Override the mock for this test
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => "Internal Server Error",
        });

        const testId = stringToUuid("test-id");

        const testEvent: MeteringEvent = {
            specversion: "1.0",
            type: "test-event",
            id: testId,
            time: new Date().toISOString(),
            source: "test-source",
            subject: "test-customer",
            data: { value: 123 },
        };

        metering.track(testEvent);

        const result = await metering.flush();

        expect(result.success).toBe(false);
        expect(result.errors).toEqual(["Internal Server Error"]);

        // Verify the event was put back in the queue
        // Should trigger another call with the same event
        await metering.flush();

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should handle network errors", async () => {
        // Override the mock for this test
        fetchMock.mockRejectedValueOnce(new Error("Network error"));

        const testId = stringToUuid("test-id");

        const testEvent: MeteringEvent = {
            specversion: "1.0",
            type: "test-event",
            id: testId,
            time: new Date().toISOString(),
            source: "test-source",
            subject: "test-customer",
            data: { value: 123 },
        };

        metering.track(testEvent);

        const result = await metering.flush();

        expect(result.success).toBe(false);
        expect(result.errors).toContain("Network error");

        // Verify the event was put back in the queue
        // Should trigger another call with the same event
        await metering.flush();

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("should batch events correctly", async () => {
        // Reset mock to ensure clean state
        fetchMock.mockClear();

        // Save original environment variable and set test value
        const savedApiKey = process.env.OPENMETER_API_KEY;
        process.env.OPENMETER_API_KEY = "test-api-key";

        const batchMetering = new Metering({
            source: "test-source",
        });

        // Stop auto-flush to control the test flow
        batchMetering.stopAutoFlush();

        const createTestEvent = (id: string) => ({
            specversion: "1.0",
            type: "test-event",
            id: stringToUuid(id),
            time: new Date().toISOString(),
            source: "test-source",
            subject: "test-customer",
            data: { id },
        });

        // Track multiple events
        batchMetering.track(createTestEvent("1"));
        batchMetering.track(createTestEvent("2"));
        batchMetering.track(createTestEvent("3"));

        // No auto-flush should happen since we disabled it
        expect(fetchMock).toHaveBeenCalledTimes(0);

        // Manually flush the events
        await batchMetering.flush();

        // Each event should be sent in a separate call
        expect(fetchMock).toHaveBeenCalledTimes(3);

        // Check that each event was sent individually
        const calls = fetchMock.mock.calls;

        // Verify each payload contains the right event
        const payload1 = JSON.parse(calls[0][1].body);
        expect(payload1.data.id).toBe("1");

        const payload2 = JSON.parse(calls[1][1].body);
        expect(payload2.data.id).toBe("2");

        const payload3 = JSON.parse(calls[2][1].body);
        expect(payload3.data.id).toBe("3");

        // Clean up
        batchMetering.dispose();
        process.env.OPENMETER_API_KEY = savedApiKey;
    });
});
