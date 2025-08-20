import { pipeline } from "@huggingface/transformers";

type RedactionEntity = {
    type: string;
    start: number;
    end: number;
    text: string;
};

export class PII {
    private classifier: any | null = null;
    private debug(...args: unknown[]) {
        if (process.env.PII_DEBUG === "true") {
            console.log("[PII]", ...args);
        }
    }

    constructor() {}

    static async create(): Promise<PII> {
        const pii = new PII();
        await pii.initialize();
        return pii;
    }

    private async initialize(): Promise<void> {
        try {
            const modelId = process.env.PII_MODEL_ID || "jammmmmm/pii";
            this.classifier = await pipeline("token-classification", modelId);
            this.debug(`classifier initialized: ${modelId}`);
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
            this.debug("redact input", {
                length: text.length,
                sample: text.slice(0, 200),
            });
            const strategy =
                (process.env.PII_AGGREGATION_STRATEGY as
                    | "none"
                    | "first"
                    | "average"
                    | "max"
                    | "simple") || "simple";
            this.debug("using aggregation strategy", strategy);

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
                aggregation_strategy: strategy,
                // Some versions expect camelCase
                aggregationStrategy: strategy,
            });

            // Flatten potential nested outputs (batch mode compatibility)
            const flat = Array.isArray(results[0])
                ? (results as Array<Array<any>>).flat()
                : (results as Array<any>);
            this.debug("classifier raw results", {
                count: Array.isArray(flat) ? flat.length : 0,
                preview: Array.isArray(flat) ? flat.slice(0, 5) : flat,
                keys:
                    Array.isArray(flat) && flat.length > 0
                        ? Object.keys(flat[0])
                        : [],
            });

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
                } else if (
                    typeof r?.entity === "string" &&
                    typeof r?.word === "string"
                ) {
                    // Fallback: if aggregator failed (no start/end), attempt naive substring match
                    const clean = r.word;
                    const idx = text.indexOf(clean.trim());
                    if (idx >= 0) {
                        const label = r.entity.replace(/^B-|^I-/, "");
                        spans.push({
                            type: label,
                            start: idx,
                            end: idx + clean.trim().length,
                        });
                    }
                }
            }

            // If spans are still empty, try grouping B-/I- sequences and match the concatenated phrase
            if (spans.length === 0 && Array.isArray(flat) && flat.length > 0) {
                type TokenRec = { entity: string; word: string };
                const tokens: TokenRec[] = (flat as any[])
                    .filter(
                        (t) =>
                            typeof t?.entity === "string" &&
                            typeof t?.word === "string"
                    )
                    .map((t) => ({
                        entity: t.entity as string,
                        word: String(t.word),
                    }));
                if (tokens.length > 0) {
                    const groups: { type: string; text: string }[] = [];
                    let currentType = "";
                    let buffer = "";
                    for (const t of tokens) {
                        const label = t.entity.replace(/^I-/, "B-");
                        const dash = label.indexOf("-");
                        const prefix = dash > 0 ? label.slice(0, dash) : label;
                        const entity = dash > 0 ? label.slice(dash + 1) : label;
                        if (
                            prefix === "B" &&
                            entity !== currentType &&
                            buffer
                        ) {
                            groups.push({ type: currentType, text: buffer });
                            buffer = "";
                        }
                        currentType = entity;
                        buffer += t.word;
                    }
                    if (buffer && currentType)
                        groups.push({ type: currentType, text: buffer });

                    let searchFrom = 0;
                    for (const g of groups) {
                        const candidate = g.text.replace(/\s+/g, " ").trim();
                        if (!candidate) continue;
                        const idx = text.indexOf(candidate, searchFrom);
                        if (idx >= 0) {
                            spans.push({
                                type: g.type,
                                start: idx,
                                end: idx + candidate.length,
                            });
                            searchFrom = idx + candidate.length;
                        }
                    }
                    this.debug("constructed spans from groups", {
                        count: spans.length,
                        preview: spans.slice(0, 5),
                    });
                }
            }
            this.debug("extracted spans", {
                count: spans.length,
                preview: spans.slice(0, 5),
            });

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
            this.debug("merged spans", {
                count: merged.length,
                preview: merged.slice(0, 5),
            });

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
            this.debug("redaction result", {
                entitiesCount: entities.length,
                redactedPreview: result.slice(0, 200),
            });

            return { redactedText: result, entities };
        } catch (error) {
            console.error(`PII redaction failed: ${error}`);
            return null;
        }
    }
}
