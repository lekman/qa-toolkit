namespace Lekman.Qualify.Values;

/// <summary>
/// How to order an object's keys when it is written. <see cref="Value"/> sorts
/// keys by code point at every depth. An object shape lists its keys in order
/// and the shape of each field; an array shape gives the shape of its items.
/// Keys an object shape does not list follow the listed ones, sorted.
/// </summary>
public sealed record JsonShape
{
    private JsonShape(IReadOnlyList<string>? order, IReadOnlyDictionary<string, JsonShape>? fields, JsonShape? items)
    {
        Order = order;
        Fields = fields;
        Items = items;
    }

    /// <summary>Keys sorted by code point, at every depth.</summary>
    public static JsonShape Value { get; } = new(null, null, null);

    /// <summary>The key order of an object, or null to sort.</summary>
    public IReadOnlyList<string>? Order { get; }

    /// <summary>The shape of each field of an object.</summary>
    public IReadOnlyDictionary<string, JsonShape>? Fields { get; }

    /// <summary>The shape of each item of an array.</summary>
    public JsonShape? Items { get; }

    /// <summary>An object with keys in the given order.</summary>
    public static JsonShape Ordered(IReadOnlyList<string> order, IReadOnlyDictionary<string, JsonShape>? fields = null) =>
        new(order, fields ?? new Dictionary<string, JsonShape>(), null);

    /// <summary>An array whose items have a shape.</summary>
    public static JsonShape ArrayOf(JsonShape items) => new(null, null, items);

    /// <summary>The shape of a field, or <see cref="Value"/> when the shape does not name it.</summary>
    public JsonShape Field(string key) =>
        Fields is not null && Fields.TryGetValue(key, out var shape) ? shape : Value;
}
