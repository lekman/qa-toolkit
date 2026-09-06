export { Spread } from "./grade";
export type { Allocation, Grade, GradeScale, Weights } from "./grade";
export { FakerRandom, Fakers } from "./faker";
export {
  Dataset,
  DatasetError,
  Distribution,
  Sampler,
  SpreadError,
  defineDataset,
} from "./sampler";
export type {
  DatasetDefinition,
  FieldGenerator,
  FieldSpec,
  GenerateContext,
  IRandom,
  SampledRecord,
  SampleOptions,
  SampleRun,
} from "./sampler";
export { FileSink, Ndjson, StdoutSink } from "./output";
export type { EncodeOptions, IOutputSink } from "./output";
