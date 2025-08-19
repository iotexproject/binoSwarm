import * as ort from "onnxruntime-node";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { Tokenizer } from "tokenizers";
import elizaLogger from "./logger";

const PII_BASE =
    "https://huggingface.co/protectai/lakshyakh93-deberta_finetuned_pii-onnx/resolve/main";
const PII_MODEL_DIR = path.resolve(process.cwd(), "models/pii");
const PII_MODEL_PATH = path.join(PII_MODEL_DIR, "pii.onnx");
const PII_TOKENIZER_PATH = path.join(PII_MODEL_DIR, "pii_tokenizer.json");
const PII_CONFIG_PATH = path.join(PII_MODEL_DIR, "pii_config.json");

const PII_MODEL_URL = `${PII_BASE}/model.onnx`;
const TOKENIZER_URL = `${PII_BASE}/tokenizer.json`;
const CONFIG_URL = `${PII_BASE}/config.json`;

export class PII {
    private session: ort.InferenceSession | null = null;
    private tokenizer: Tokenizer | null = null;
    private idToLabel: Record<number, string> = {};

    constructor() {}

    static async create(): Promise<PII> {
        const pii = new PII();
        await pii.initialize();
        return pii;
    }

    private async initialize(): Promise<void> {
        try {
            await this.ensureArtifacts();
            this.session = await ort.InferenceSession.create(PII_MODEL_PATH);
            this.tokenizer = Tokenizer.fromFile(PII_TOKENIZER_PATH);
            this.idToLabel = await this.loadIdToLabel();
            elizaLogger.log(
                "PII model and tokenizer initialized successfully."
            );
        } catch (error) {
            elizaLogger.error(`Failed to initialize PII model: ${error}`);
            this.session = null;
            this.tokenizer = null;
            this.idToLabel = {};
        }
    }

    private async ensureArtifacts(): Promise<void> {
        if (!fs.existsSync(PII_MODEL_DIR)) {
            fs.mkdirSync(PII_MODEL_DIR, { recursive: true });
        }
        await Promise.all([
            this.downloadIfMissing(PII_MODEL_URL, PII_MODEL_PATH),
            this.downloadIfMissing(TOKENIZER_URL, PII_TOKENIZER_PATH),
            this.downloadIfMissing(CONFIG_URL, PII_CONFIG_PATH),
        ]);
    }

    private async downloadIfMissing(
        url: string,
        destPath: string
    ): Promise<void> {
        if (fs.existsSync(destPath)) {
            return;
        }
        elizaLogger.log(`Downloading ${url} -> ${destPath}`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(
                `Failed to download ${url}: ${response.status} ${response.statusText}`
            );
        }
        const arrayBuffer = await response.arrayBuffer();
        await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
    }

    private async loadIdToLabel(): Promise<Record<number, string>> {
        try {
            const raw = fs.readFileSync(PII_CONFIG_PATH, "utf-8");
            const json = JSON.parse(raw);
            // HF config usually has id2label as mapping of stringified indices to string labels
            const id2label = json.id2label || {};
            const map: Record<number, string> = {};
            for (const [k, v] of Object.entries(id2label)) {
                const idx = Number(k);
                if (!Number.isNaN(idx)) {
                    map[idx] = String(v);
                }
            }
            return map;
        } catch {
            elizaLogger.warn(
                "PII config missing id2label; defaulting to empty map."
            );
            return {};
        }
    }

    async redact(
        text: string,
        replacement: string = "[REDACTED]"
    ): Promise<{
        redactedText: string;
        entities: { type: string; start: number; end: number; text: string }[];
    } | null> {
        if (!this.session || !this.tokenizer) {
            elizaLogger.warn("PII model not initialized; cannot redact.");
            return null;
        }

        if (!text || typeof text !== "string") {
            return { redactedText: text, entities: [] };
        }

        try {
            const encoding = await this.tokenizer.encode(text);
            const ids = encoding.getIds();
            const mask = encoding.getAttentionMask();
            const offsets = encoding.getOffsets();

            const seqLen = ids.length;
            const inputIds = new BigInt64Array(seqLen);
            const attentionMask = new BigInt64Array(seqLen);
            for (let i = 0; i < seqLen; i++) {
                inputIds[i] = BigInt(ids[i]);
                attentionMask[i] = BigInt(mask[i]);
            }

            const feeds: Record<string, ort.Tensor> = {
                input_ids: new ort.Tensor("int64", inputIds, [1, seqLen]),
                attention_mask: new ort.Tensor("int64", attentionMask, [
                    1,
                    seqLen,
                ]),
            };

            // Some models require token_type_ids; provide zeros if present in model inputs
            if (this.session.inputNames.includes("token_type_ids")) {
                const tokenType = new BigInt64Array(seqLen).fill(BigInt(0));
                feeds.token_type_ids = new ort.Tensor("int64", tokenType, [
                    1,
                    seqLen,
                ]);
            }

            const outputs = await this.session.run(feeds);
            const logitsKey =
                Object.keys(outputs).find((k) =>
                    k.toLowerCase().includes("logits")
                ) || Object.keys(outputs)[0];
            const logitsTensor = outputs[logitsKey];
            const logitsData = logitsTensor.data as Float32Array;

            // logits shape: [1, seqLen, numLabels]
            const numLabels = (logitsTensor.dims && logitsTensor.dims[2]) || 0;
            const predictedIds: number[] = [];
            for (let t = 0; t < seqLen; t++) {
                let bestId = 0;
                let bestVal = -Infinity;
                for (let c = 0; c < numLabels; c++) {
                    const val = logitsData[t * numLabels + c];
                    if (val > bestVal) {
                        bestVal = val;
                        bestId = c;
                    }
                }
                predictedIds.push(bestId);
            }

            // Build entity spans from BIO labels using offsets
            type Span = { type: string; start: number; end: number };
            const spans: Span[] = [];
            let current: Span | null = null;
            for (let i = 0; i < seqLen; i++) {
                const [start, end] = offsets[i];
                // Offsets for special tokens are often [0,0] or [0,0] with mask 1; ignore if invalid
                if (end <= start) {
                    continue;
                }
                const label = this.idToLabel[predictedIds[i]] || "O";
                if (label === "O") {
                    if (current) {
                        spans.push(current);
                        current = null;
                    }
                    continue;
                }
                const dash = label.indexOf("-");
                const prefix = dash > 0 ? label.slice(0, dash) : label;
                const entity = dash > 0 ? label.slice(dash + 1) : label;

                if (
                    prefix === "B" ||
                    !current ||
                    current.type !== entity ||
                    start > current.end
                ) {
                    if (current) spans.push(current);
                    current = { type: entity, start, end };
                } else {
                    // I- continuation
                    current.end = Math.max(current.end, end);
                }
            }
            if (current) spans.push(current);

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
            const entities: {
                type: string;
                start: number;
                end: number;
                text: string;
            }[] = [];
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
            elizaLogger.error(`PII redaction failed: ${error}`);
            return null;
        }
    }
}
