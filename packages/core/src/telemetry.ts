import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { LangfuseExporter } from "langfuse-vercel";

export const langfuseTelemetry = new NodeSDK({
    traceExporter: new LangfuseExporter({
        environment: process.env.LANGFUSE_ENV || "development",
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});
