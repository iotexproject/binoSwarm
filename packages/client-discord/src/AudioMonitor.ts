import { elizaLogger } from "@elizaos/core";
import { Readable } from "stream";

export class AudioMonitor {
    private readable: Readable;
    private buffers: Buffer[] = [];
    private maxSize: number;
    private lastFlagged: number = -1;
    private ended: boolean = false;

    constructor(
        readable: Readable,
        maxSize: number,
        onStart: () => void,
        callback: (buffer: Buffer) => void
    ) {
        this.readable = readable;
        this.maxSize = maxSize;
        this.readable.on("data", (chunk: Buffer) => {
            this.handleOnData(chunk);
        });
        this.readable.on("end", () => {
            this.handleOnEnd(callback);
        });
        this.readable.on("speakingStopped", () => {
            this.handleOnSpeakingStopped(callback);
        });
        this.readable.on("speakingStarted", () => {
            this.handleOnSpeakingStarted(onStart);
        });
    }

    private handleOnSpeakingStarted(onStart: () => void) {
        if (this.ended) return;
        onStart();
        elizaLogger.log("Speaking started");
        this.reset();
    }

    private handleOnSpeakingStopped(callback: (buffer: Buffer) => void) {
        if (this.ended) return;
        elizaLogger.log("Speaking stopped");
        if (this.lastFlagged < 0) return;
        callback(this.getBufferFromStart());
    }

    private handleOnEnd(callback: (buffer: Buffer) => void) {
        elizaLogger.log("AudioMonitor ended");
        this.ended = true;
        if (this.lastFlagged < 0) return;
        callback(this.getBufferFromStart());
        this.lastFlagged = -1;
    }

    private handleOnData(chunk: Buffer<ArrayBufferLike>) {
        if (this.lastFlagged < 0) {
            this.lastFlagged = this.buffers.length;
        }
        this.buffers.push(chunk);
        const currentSize = this.buffers.reduce(
            (acc, cur) => acc + cur.length,
            0
        );
        while (currentSize > this.maxSize) {
            this.buffers.shift();
            this.lastFlagged--;
        }
    }

    stop() {
        this.readable.removeAllListeners("data");
        this.readable.removeAllListeners("end");
        this.readable.removeAllListeners("speakingStopped");
        this.readable.removeAllListeners("speakingStarted");
    }

    isFlagged() {
        return this.lastFlagged >= 0;
    }

    getBufferFromFlag() {
        if (this.lastFlagged < 0) {
            return null;
        }
        const buffer = Buffer.concat(this.buffers.slice(this.lastFlagged));
        return buffer;
    }

    getBufferFromStart() {
        const buffer = Buffer.concat(this.buffers);
        return buffer;
    }

    reset() {
        this.buffers = [];
        this.lastFlagged = -1;
    }

    isEnded() {
        return this.ended;
    }
}
