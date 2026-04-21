import { workerData, parentPort } from "worker_threads";
import { analyzeSlice, type WorkerInput } from "../analysis/field-analyzer.js";

const input = workerData as WorkerInput;
const result = analyzeSlice(input.jsonSlice, input.arrayPath, input.maxItems);
parentPort?.postMessage(result);
