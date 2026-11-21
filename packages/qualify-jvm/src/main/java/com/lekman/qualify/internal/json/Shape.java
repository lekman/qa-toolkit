package com.lekman.qualify.internal.json;

import java.util.List;
import java.util.Map;

/**
 * How to order an object's keys when it is written. {@link #VALUE} sorts keys by code point at
 * every depth. An object shape lists its keys in order and the shape of each field; an items shape
 * gives the shape of a list's items.
 */
public sealed interface Shape permits Shape.Value, Shape.Obj, Shape.Items {

  /** Keys sorted by code point at every depth. */
  Shape VALUE = new Value();

  /** Keys sorted by code point at every depth. */
  record Value() implements Shape {}

  /**
   * Known keys first, in the given order, then any other key sorted by code point.
   *
   * @param order the known keys, in the order they are written
   * @param fields the shape of each known key's value; missing keys use {@link #VALUE}
   */
  record Obj(List<String> order, Map<String, Shape> fields) implements Shape {
    /** The shape of one field's value. */
    public Shape field(String key) {
      return fields.getOrDefault(key, VALUE);
    }
  }

  /**
   * A list whose items share one shape.
   *
   * @param items the shape of every item
   */
  record Items(Shape items) implements Shape {}

  /** An object shape with known keys whose values are plain values. */
  static Shape object(String... order) {
    return new Obj(List.of(order), Map.of());
  }

  /** An object shape with known keys and the shapes of some fields. */
  static Shape object(List<String> order, Map<String, Shape> fields) {
    return new Obj(List.copyOf(order), Map.copyOf(fields));
  }

  /** A list of items with one shape. */
  static Shape items(Shape items) {
    return new Items(items);
  }
}
