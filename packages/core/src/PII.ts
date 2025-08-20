import { pipeline } from "@huggingface/transformers";

type RedactionEntity = {
    type: string;
    start: number;
    end: number;
    text: string;
};

export class PII {
    private classifier: any | null = null;

    constructor() {}

    static async create(): Promise<PII> {
        const pii = new PII();
        await pii.initialize();
        return pii;
    }

    private async initialize(): Promise<void> {
        try {
            const modelId =
                process.env.PII_MODEL_ID ||
                "protectai/lakshyakh93-deberta_finetuned_pii-onnx";
            // this.classifier = await pipeline("token-classification", modelId);
            this.classifier = pipeline("token-classification", modelId);
            console.log("PII classifier initialized successfully.");
        } catch (error) {
            console.error(`Failed to initialize PII classifier: ${error}`);
            this.classifier = null;
        }
    }

    async redact(
        text: string,
        replacement: string = "[REDACTED]"
    ): Promise<{ redactedText: string; entities: RedactionEntity[] } | null> {
        if (!this.classifier) {
            console.warn("PII classifier not initialized; cannot redact.");
            return null;
        }

        if (!text || typeof text !== "string") {
            return { redactedText: text, entities: [] };
        }

        try {
            const results: Array<
                | {
                      start: number;
                      end: number;
                      entity?: string;
                      entity_group?: string;
                  }
                | Array<{
                      start: number;
                      end: number;
                      entity?: string;
                      entity_group?: string;
                  }>
            > = await this.classifier(text, {
                aggregationStrategy:
                    (process.env.PII_AGGREGATION_STRATEGY as
                        | "none"
                        | "first"
                        | "average"
                        | "max"
                        | "simple") || "first",
            });

            // Flatten potential nested outputs (batch mode compatibility)
            const flat = Array.isArray(results[0])
                ? (results as Array<Array<any>>).flat()
                : (results as Array<any>);

            type Span = { type: string; start: number; end: number };
            const spans: Span[] = [];
            for (const r of flat) {
                if (
                    typeof r?.start === "number" &&
                    typeof r?.end === "number"
                ) {
                    const label = (r.entity_group || r.entity || "").replace(
                        /^B-|^I-/,
                        ""
                    );
                    if (label) {
                        spans.push({ type: label, start: r.start, end: r.end });
                    }
                }
            }

            // Merge overlapping/adjacent spans
            spans.sort((a, b) => a.start - b.start);
            const merged: Span[] = [];
            for (const s of spans) {
                const last = merged[merged.length - 1];
                if (last && s.start <= last.end) {
                    last.end = Math.max(last.end, s.end);
                } else {
                    merged.push({ ...s });
                }
            }

            // Redact text
            let result = "";
            let cursor = 0;
            const entities: RedactionEntity[] = [];
            for (const s of merged) {
                result += text.slice(cursor, s.start) + replacement;
                entities.push({
                    type: s.type,
                    start: s.start,
                    end: s.end,
                    text: text.slice(s.start, s.end),
                });
                cursor = s.end;
            }
            result += text.slice(cursor);

            return { redactedText: result, entities };
        } catch (error) {
            console.error(`PII redaction failed: ${error}`);
            return null;
        }
    }
}
