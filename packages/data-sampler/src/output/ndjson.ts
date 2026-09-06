import type { SampledRecord } from "../sampler/types";
import type { EncodeOptions } from "./types";

/** Encodes sampled records as newline-delimited JSON or a JSON document. */
export class Ndjson {
  /** A JSON array document, pretty-printed with two spaces, newline terminated. */
  static document<T>(
    records: Iterable<SampledRecord<T>>,
    options: EncodeOptions,
  ): string {
    const objects = [];
    for (const record of records) objects.push(Ndjson.object(record, options));
    return `${JSON.stringify(objects, null, 2)}\n`;
  }

  /** One JSON object on one line, newline terminated. */
  static line<T>(record: SampledRecord<T>, options: EncodeOptions): string {
    return `${JSON.stringify(Ndjson.object(record, options))}\n`;
  }

  /** The record's data, with `_meta: { grade, index, seed }` first when asked for. */
  static object<T>(record: SampledRecord<T>, options: EncodeOptions): object {
    if (!options.meta) return record.data as object;
    return {
      _meta: { grade: record.grade, index: record.index, seed: options.seed },
      ...(record.data as object),
    };
  }
}
