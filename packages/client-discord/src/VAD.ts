import * as ort from "onnxruntime-node";
import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // Or use the built-in fetch if Node version supports it
import { elizaLogger } from "@elizaos/core";
import { Readable } from "stream";

// Constants for Silero VAD
// Use the /raw/ link to download the actual model file, not the HTML page
const VAD_MODEL_URL =
    "https://github.com/snakers4/silero-vad/raw/0dd45f0bcd7271463c234f3bae5ad25181f9df8b/src/silero_vad/data/silero_vad.onnx";
const VAD_MODEL_DIR = path.resolve(process.cwd(), "models"); // Store models in a root 'models' directory
const VAD_MODEL_PATH = path.join(VAD_MODEL_DIR, "silero_vad.onnx");
const VAD_SAMPLE_RATE = 16000;
const VAD_FRAME_SIZE = 480; // 30ms * 16kHz = 480 samples
// const VAD_THRESHOLD = 0.5; // Removed - Threshold is handled in voice.ts (SPEAKING_THRESHOLD)

export class SileroVAD {
    private session: ort.InferenceSession | null = null;
    private state: ort.Tensor | null = null;
    private inputBuffer: Float32Array = new Float32Array(0);

    constructor() {
        // Initialization will be done in an async factory method
    }

    static async create(): Promise<SileroVAD> {
        const vad = new SileroVAD();
        await vad.initialize();
        return vad;
    }

    private async downloadModelIfNotExists(): Promise<void> {
        if (!fs.existsSync(VAD_MODEL_PATH)) {
            elizaLogger.log(
                `Silero VAD model not found at ${VAD_MODEL_PATH}. Downloading...`
            );
            if (!fs.existsSync(VAD_MODEL_DIR)) {
                fs.mkdirSync(VAD_MODEL_DIR, { recursive: true });
            }
            try {
                const response = await fetch(VAD_MODEL_URL);
                if (!response.ok) {
                    throw new Error(
                        `Failed to download model: ${response.statusText}`
                    );
                }
                const fileStream = fs.createWriteStream(VAD_MODEL_PATH);
                await new Promise((resolve, reject) => {
                    (response.body as Readable).pipe(fileStream);
                    (response.body as Readable).on("error", reject);
                    fileStream.on("finish", resolve);
                });
                elizaLogger.log(
                    `Silero VAD model downloaded successfully to ${VAD_MODEL_PATH}`
                );
            } catch (error) {
                elizaLogger.error(
                    `Error downloading Silero VAD model: ${error}`
                );
                throw error; // Re-throw to prevent initialization if download fails
            }
        } else {
            elizaLogger.log(`Silero VAD model found at ${VAD_MODEL_PATH}`);
        }
    }

    private async initialize(): Promise<void> {
        try {
            await this.downloadModelIfNotExists();
            this.session = await ort.InferenceSession.create(VAD_MODEL_PATH);
            this.reset();
            elizaLogger.log("Silero VAD session initialized successfully.");
        } catch (error) {
            elizaLogger.error(
                `Failed to initialize Silero VAD session: ${error}`
            );
            this.session = null; // Ensure session is null if init fails
        }
    }

    reset(): void {
        if (!this.session) return;
        const hidden_dims = [2, 1, 128]; // Shape from Rust example
        const initial_data = new Float32Array(
            hidden_dims.reduce((a, b) => a * b)
        ).fill(0);

        this.state = new ort.Tensor("float32", initial_data, hidden_dims); // Initialize the single state tensor
        this.inputBuffer = new Float32Array(0);
        elizaLogger.debug("Silero VAD state reset.");
    }

    /**
     * Processes a chunk of PCM audio data (Float32Array).
     * Returns speech probability (0-1) or null if not enough data or error.
     */
    async process(pcmData: Float32Array): Promise<number | null> {
        if (!this.session || !this.state) {
            elizaLogger.warn(
                "Silero VAD session or state not initialized, cannot process audio."
            );
            return null;
        }

        // Append new data to the internal buffer
        const newBuffer = new Float32Array(
            this.inputBuffer.length + pcmData.length
        );
        newBuffer.set(this.inputBuffer, 0);
        newBuffer.set(pcmData, this.inputBuffer.length);
        this.inputBuffer = newBuffer;

        // Process frames as long as we have enough data
        let speechProbability: number | null = null;
        while (this.inputBuffer.length >= VAD_FRAME_SIZE) {
            const frame = this.inputBuffer.slice(0, VAD_FRAME_SIZE);
            this.inputBuffer = this.inputBuffer.slice(VAD_FRAME_SIZE); // Remove processed frame

            try {
                const inputTensor = new ort.Tensor("float32", frame, [
                    1,
                    VAD_FRAME_SIZE,
                ]);
                const srTensor = new ort.Tensor(
                    "int64",
                    new BigInt64Array([BigInt(VAD_SAMPLE_RATE)]),
                    [1]
                );

                const feeds: ort.InferenceSession.FeedsType = {
                    input: inputTensor,
                    sr: srTensor,
                    state: this.state,
                };

                const results = await this.session.run(feeds);

                const outputProbability = results.output.data[0] as number;

                if (results.stateN && results.stateN instanceof ort.Tensor) {
                    this.state = results.stateN;
                } else {
                    elizaLogger.warn(
                        "Silero VAD model did not return expected 'stateN' tensor."
                    );
                    this.reset();
                    return null;
                }

                speechProbability = outputProbability;
            } catch (error) {
                elizaLogger.error(
                    `Error during Silero VAD inference: ${error}`
                );
                this.reset();
                return null;
            }
        }

        return speechProbability;
    }

    /**
     * Converts Buffer (Int16 Little Endian) to Float32Array [-1.0, 1.0].
     * Assumes input buffer is 16-bit PCM audio.
     */
    static bufferToFloat32(buffer: Buffer): Float32Array {
        const float32Array = new Float32Array(buffer.length / 2);
        for (let i = 0; i < float32Array.length; i++) {
            float32Array[i] = buffer.readInt16LE(i * 2) / 32768.0;
        }
        return float32Array;
    }
}
