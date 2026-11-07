// Loaded with `--import` before express so http/express/undici get instrumented.
// Exporter protocol is chosen by the standard OTEL_EXPORTER_OTLP_PROTOCOL env var
// (grpc, http/protobuf or http/json), which NodeSDK reads itself.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "runtime",
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new UndiciInstrumentation(),
    ],
  });
  sdk.start();
  process.on("SIGTERM", () => void sdk.shutdown());
}
