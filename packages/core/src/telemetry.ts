import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { LangfuseExporter } from "langfuse-vercel";

export const langfuseTelemetry = new NodeSDK({
    traceExporter: new LangfuseExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
});

