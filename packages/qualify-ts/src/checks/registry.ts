import type { ISecretRegistry } from "./interfaces";

import { Redaction } from "../redaction";

/** Registered secret values, refusing values too short to redact safely. */
export class SecretRegistry implements ISecretRegistry {
  private readonly registered = new Set<string>();

  /** Register a value for redaction. */
  add(value: string): boolean {
    if (value.length < Redaction.MIN_LENGTH) return false;
    this.registered.add(value);
    return true;
  }

  /** Every registered value, in registration order. */
  values(): readonly string[] {
    return [...this.registered];
  }
}
