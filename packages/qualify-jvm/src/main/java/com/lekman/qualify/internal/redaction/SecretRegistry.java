package com.lekman.qualify.internal.redaction;

import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Values registered for redaction in one test JVM, refusing values too short to redact safely. Safe
 * to use from tests running in parallel.
 */
public final class SecretRegistry {

  private final Set<String> seen = ConcurrentHashMap.newKeySet();
  private final List<String> registered = new CopyOnWriteArrayList<>();

  /** Register a value; {@code false} when it is shorter than {@link Redaction#MIN_LENGTH}. */
  public boolean add(String value) {
    if (value.length() < Redaction.MIN_LENGTH) {
      return false;
    }
    if (seen.add(value)) {
      registered.add(value);
    }
    return true;
  }

  /** Every registered value, in registration order. */
  public List<String> values() {
    return List.copyOf(registered);
  }
}
