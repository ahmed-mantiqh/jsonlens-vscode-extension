import { workerData, parentPort } from "worker_threads";
import { inferSchemaSlice, type WorkerInput } from "../analysis/schema-inferrer.js";

const input = workerData as WorkerInput;
const result = inferSchemaSlice(input.jsonSlice, input.maxDepth);
parentPort?.postMessage(result);
