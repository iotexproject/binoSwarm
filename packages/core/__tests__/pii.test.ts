import { describe, it, expect, beforeAll } from "vitest";
import { PII } from "@elizaos/core";

describe.skip("PII redaction", () => {
    let pii: PII;

    beforeAll(async () => {
        process.env.PII_MODEL_ID = process.env.PII_MODEL_ID || "jammmmmm/pii";
        process.env.PII_AGGREGATION_STRATEGY =
            process.env.PII_AGGREGATION_STRATEGY || "simple";
        process.env.PII_DEBUG = "true";
        pii = await PII.create();
    }, 120_000);

    async function expectRedacted(input: string, mustNotContain: string[]) {
        const result = await pii.redact(input);
        expect(result).not.toBeNull();
        if (!result) return;
        expect(result.entities.length).toBeGreaterThan(0);
        for (const s of mustNotContain) {
            expect(result.redactedText).not.toContain(s);
        }
    }

    it("redacts email addresses", async () => {
        const input = "Contact me at alice.smith@example.org for details.";
        await expectRedacted(input, ["alice.smith", "example.org"]);
    }, 120_000);

    it("redacts names", async () => {
        const input = "My name is John Doe.";
        await expectRedacted(input, ["John", "Doe"]);
    }, 120_000);

    it("redacts phone numbers", async () => {
        const input = "Call me at +1 (415) 555-2671 tomorrow.";
        await expectRedacted(input, ["415", "555-2671"]);
    }, 120_000);

    it("redacts crypto wallet addresses (BTC)", async () => {
        const input =
            "Donate BTC to bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080";
        await expectRedacted(input, [
            "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
        ]);
    }, 120_000);

    it("redacts crypto wallet addresses (ETH)", async () => {
        const input =
            "Send ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e please.";
        await expectRedacted(input, [
            "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
        ]);
    }, 120_000);

    it("redacts private keys (hex)", async () => {
        const key =
            "4f3edf983ac636a65a842ce7c78d9aa706d3b113bce036f8e6f2b59e6fc9b8a7";
        const input = `Never share your private key: ${key}`;
        await expectRedacted(input, [key]);
    }, 120_000);

    it("redacts home addresses", async () => {
        const input =
            "Ship it to 1600 Amphitheatre Parkway, Mountain View, CA 94043.";
        await expectRedacted(input, ["1600 Amphitheatre", "94043"]);
    }, 120_000);
});
