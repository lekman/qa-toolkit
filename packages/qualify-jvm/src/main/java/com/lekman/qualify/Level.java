package com.lekman.qualify;

/**
 * The qualification level, chosen by the annotation: {@link IQ}, {@link OQ}, {@link PQ} or {@link
 * IU}.
 */
public enum Level {
  /** Installation qualification. */
  IQ,
  /** Operational qualification. */
  OQ,
  /** Performance qualification. */
  PQ,
  /** Intended use. */
  IU
}
