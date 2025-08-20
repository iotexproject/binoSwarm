import { pipeline } from "@huggingface/transformers";

type RedactionEntity = {
    type: string;
    start: number;
    end: number;
    text: string;
};

interface ClassifierResult {
    start?: number;
    end?: number;
    entity?: string;
    entity_group?: string;
    word?: string;
    score?: number;
}

interface Span {
    type: string;
    start: number;
    end: number;
    score?: number;
}

interface Classifier {
    (
        text: string,
        options?: Record<string, unknown>
    ): Promise<Array<ClassifierResult | Array<ClassifierResult>>>;
}

export class PII {
    private classifier: Classifier | null = null;
    private debug(...args: unknown[]) {
        if (process.env.PII_DEBUG === "true") {
            console.log("[PII]", ...args);
        }
    }

    private isValidEntity(span: Span, text: string): boolean {
        const entityText = text.slice(span.start, span.end);

        // Simple validation - just check if it's meaningful text
        return entityText.trim().length > 1 && !/^[^\w\d]+$/.test(entityText);
    }

    private performWordLevelRedaction(
        text: string,
        spans: Span[],
        replacement: string
    ): { redactedText: string; entities: RedactionEntity[] } {
        this.debug("performing word-level redaction");

        // Find word boundaries (split by whitespace but preserve the whitespace)
        const words: {
            text: string;
            start: number;
            end: number;
            isWhitespace: boolean;
        }[] = [];
        let currentWord = "";
        let wordStart = 0;

        for (let i = 0; i <= text.length; i++) {
            const char = i < text.length ? text[i] : null;
            const isWhitespace = char === null || /\s/.test(char);

            if (isWhitespace) {
                // End of word
                if (currentWord.length > 0) {
                    words.push({
                        text: currentWord,
                        start: wordStart,
                        end: wordStart + currentWord.length,
                        isWhitespace: false,
                    });
                    currentWord = "";
                }

                // Add whitespace character(s)
                if (char !== null) {
                    const whitespaceStart = i;
                    let whitespace = char;

                    // Collect consecutive whitespace
                    while (i + 1 < text.length && /\s/.test(text[i + 1])) {
                        i++;
                        whitespace += text[i];
                    }

                    words.push({
                        text: whitespace,
                        start: whitespaceStart,
                        end: i + 1,
                        isWhitespace: true,
                    });
                }
            } else {
                // Start of new word or continue existing word
                if (currentWord.length === 0) {
                    wordStart = i;
                }
                currentWord += char;
            }
        }

        // Check which words contain PII
        const entities: RedactionEntity[] = [];
        let result = "";

        for (const word of words) {
            if (word.isWhitespace) {
                result += word.text;
                continue;
            }

            // Check if this word overlaps with any PII spans
            const overlappingSpans = spans.filter(
                (span) => span.start < word.end && span.end > word.start
            );

            if (overlappingSpans.length > 0) {
                // Word contains PII - redact the entire word
                result += replacement;

                // Create consolidated entity for this word
                const types = [...new Set(overlappingSpans.map((s) => s.type))];
                entities.push({
                    type: types.join("|"), // If multiple types in one word
                    start: word.start,
                    end: word.end,
                    text: word.text,
                });

                this.debug(`redacting word "${word.text}"`);
            } else {
                // Word is clean
                result += word.text;
            }
        }

        this.debug("word-level redaction result", {
            entitiesCount: entities.length,
            redactedPreview: result.slice(0, 200),
        });

        return { redactedText: result, entities };
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

            const results: Array<ClassifierResult | Array<ClassifierResult>> =
                await this.classifier(text, {
                    aggregation_strategy: strategy,
                });

            // Flatten potential nested outputs (batch mode compatibility)
            const flat = Array.isArray(results[0])
                ? (results as Array<Array<ClassifierResult>>).flat()
                : (results as Array<ClassifierResult>);

            this.debug("classifier raw results", {
                count: Array.isArray(flat) ? flat.length : 0,
                preview: Array.isArray(flat) ? flat.slice(0, 5) : flat,
                keys:
                    Array.isArray(flat) && flat.length > 0
                        ? Object.keys(flat[0])
                        : [],
            });

            const spans: Span[] = [];
            const CONFIDENCE_THRESHOLD = process.env.PII_CONFIDENCE_THRESHOLD
                ? Number(process.env.PII_CONFIDENCE_THRESHOLD)
                : 0.8;
            for (const r of flat) {
                // Apply confidence filtering - skip low confidence detections
                const score = r?.score || 0;
                if (score < CONFIDENCE_THRESHOLD) {
                    continue;
                }

                if (
                    typeof r?.start === "number" &&
                    typeof r?.end === "number"
                ) {
                    const label = (r.entity_group || r.entity || "").replace(
                        /^B-|^I-/,
                        ""
                    );
                    if (label) {
                        spans.push({
                            type: label,
                            start: r.start,
                            end: r.end,
                            score,
                        });
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
                            score,
                        });
                    }
                }
            }

            // If spans are still empty, try grouping B-/I- sequences and match the concatenated phrase
            if (spans.length === 0 && Array.isArray(flat) && flat.length > 0) {
                type TokenRec = { entity: string; word: string };
                const tokens: TokenRec[] = (flat as ClassifierResult[])
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

            // Simple span merging - overlapping/adjacent spans only
            spans.sort((a, b) => a.start - b.start);
            const merged: Span[] = [];

            for (const s of spans) {
                const last = merged[merged.length - 1];

                if (last && last.type === s.type && s.start <= last.end) {
                    // Merge overlapping spans of the same type
                    last.end = Math.max(last.end, s.end);
                } else {
                    merged.push({ ...s });
                }
            }
            this.debug("merged spans", {
                count: merged.length,
                preview: merged.slice(0, 5),
            });

            // Simple validation to filter out invalid detections
            const validated = merged.filter((span) =>
                this.isValidEntity(span, text)
            );
            this.debug("validated spans", {
                count: validated.length,
                preview: validated.slice(0, 5),
            });

            // Use word-level redaction
            if (validated.length > 0) {
                return this.performWordLevelRedaction(
                    text,
                    validated,
                    replacement
                );
            }

            // No PII detected
            return { redactedText: text, entities: [] };
        } catch (error) {
            console.error(`PII redaction failed: ${error}`);
            return null;
        }
    }
}
