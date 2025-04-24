import { createHash } from "crypto";
import {
    Pinecone,
    Index,
    RecordMetadata,
    ScoredPineconeRecord,
} from "@pinecone-database/pinecone";

export class VectorDB<T extends RecordMetadata> {
    index: Index<T>;

    constructor() {
        const pc = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY || "",
        });
        this.index = pc.index<T>(process.env.PINECONE_INDEX || "");
    }

    async upsert(params: {
        namespace: string;
        values: ScoredPineconeRecord<T>[];
    }): Promise<void> {
        await this.index.namespace(params.namespace).upsert(params.values);
    }

    async removeVector(id: string, namespace: string): Promise<void> {
        await this.index.namespace(namespace).deleteOne(id);
    }

    async removeAllVectors(namespace: string): Promise<void> {
        await this.index.namespace(namespace).deleteAll();
    }

    async removeByFilter<T>(filter: T, namespace: string): Promise<void> {
        await this.index.namespace(namespace).deleteMany({
            filter,
        });
    }

    async search(params: {
        namespace: string;
        topK: number;
        vector: number[];
        type?:
            | string
            | { $eq?: string; $ne?: string; $in?: string[]; $nin?: string[] };
        filter: RecordMetadata;
    }): Promise<ScoredPineconeRecord<T>[]> {
        const results = await this.index.namespace(params.namespace).query({
            vector: params.vector,
            topK: params.topK,
            includeMetadata: true,
            filter: {
                type: params.type,
                ...params.filter,
            },
        });
        return results.matches;
    }

    hashInput(input: string): string {
        return createHash("sha256")
            .update(input.trim().toLowerCase())
            .digest("hex");
    }
}
