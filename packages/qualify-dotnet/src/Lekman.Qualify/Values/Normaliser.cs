using System.Collections;
using System.Globalization;
using System.Numerics;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Lekman.Qualify.Values;

/// <summary>
/// Normalisation and comparison of values recorded as <c>expected</c> and
/// <c>actual</c>, as section 7.1 of the specification defines them.
/// </summary>
public static class Normaliser
{
    private static readonly BigInteger Limit = BigInteger.Pow(2, 53);

    /// <summary>
    /// Normalise a value for the evidence: sorted keys, bytes as <c>$bytes</c>,
    /// instants as UTC timestamps, big and non-finite numbers as strings, and
    /// values that cannot be serialised as <c>[unserialisable: &lt;type&gt;]</c>.
    /// A value holding a cycle becomes one such string as a whole.
    /// </summary>
    public static JsonNode? Normalise(object? value)
    {
        try
        {
            return Walk(value, [with(ReferenceEqualityComparer.Instance)]);
        }
        catch (CycleFound)
        {
            return Unserialisable(value!);
        }
    }

    /// <summary>Deep equality after normalisation. <c>NaN</c> equals itself here.</summary>
    public static bool Equal(object? a, object? b) => Key(Normalise(a)) == Key(Normalise(b));

    /// <summary>
    /// A compact text form of a normalised value with sorted keys. Two values
    /// are deep-equal exactly when their keys are equal.
    /// </summary>
    public static string Key(JsonNode? value) => JsonText.Compact(value);

    /// <summary>
    /// The number of elements, characters or entries in a value, or null when
    /// it has no length. A string's length counts Unicode code points.
    /// </summary>
    public static int? LengthOf(object? value) => value switch
    {
        string text => CodePoints(text),
        byte[] bytes => bytes.Length,
        ReadOnlyMemory<byte> memory => memory.Length,
        Memory<byte> memory => memory.Length,
        ICollection collection => collection.Count,
        JsonArray array => array.Count,
        JsonObject obj => obj.Count,
        _ => GenericCount(value),
    };

    /// <summary>The number of Unicode code points in a string.</summary>
    public static int CodePoints(string text) => text.EnumerateRunes().Count();

    /// <summary>The <c>[unserialisable: &lt;type&gt;]</c> text for a value.</summary>
    public static string Unserialisable(object value) => $"[unserialisable: {TypeName(value.GetType())}]";

    /// <summary>A readable type name, with generic arguments: <c>List&lt;Object&gt;</c>.</summary>
    public static string TypeName(Type type)
    {
        if (!type.IsGenericType)
        {
            return type.Name;
        }

        var name = type.Name;
        var tick = name.IndexOf('`', StringComparison.Ordinal);
        if (tick >= 0)
        {
            name = name[..tick];
        }

        return $"{name}<{string.Join(",", type.GetGenericArguments().Select(TypeName))}>";
    }

    /// <summary>Sort normalised values: numbers numerically, strings by code point, otherwise by key text.</summary>
    public static List<JsonNode?> Sort(IEnumerable<JsonNode?> values)
    {
        var list = values.ToList();
        if (list.All(IsNumber))
        {
            list.Sort((a, b) => ToDouble((JsonValue)a!).CompareTo(ToDouble((JsonValue)b!)));
        }
        else if (list.All(IsString))
        {
            list.Sort((a, b) => CodePointComparer.Instance.Compare(a!.GetValue<string>(), b!.GetValue<string>()));
        }
        else
        {
            list.Sort((a, b) => CodePointComparer.Instance.Compare(Key(a), Key(b)));
        }

        return list;
    }

    /// <summary>The timestamp format of the schema: UTC, milliseconds, a Z suffix.</summary>
    public static string Timestamp(DateTimeOffset instant) =>
        instant.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>A normalised number: an integer within plus or minus 2^53, a fraction, or a string.</summary>
    public static JsonNode Number(double value)
    {
        if (double.IsNaN(value))
        {
            return JsonValue.Create("NaN");
        }

        if (double.IsPositiveInfinity(value))
        {
            return JsonValue.Create("Infinity");
        }

        if (double.IsNegativeInfinity(value))
        {
            return JsonValue.Create("-Infinity");
        }

        if (Math.Floor(value) == value)
        {
            var whole = new BigInteger(value);
            return WholeNumber(whole);
        }

        return JsonValue.Create(value);
    }

    /// <summary>A normalised integer: a number within plus or minus 2^53, otherwise a string.</summary>
    public static JsonNode WholeNumber(BigInteger value) =>
        BigInteger.Abs(value) <= Limit
            ? JsonValue.Create((long)value)
            : JsonValue.Create(value.ToString(CultureInfo.InvariantCulture));

    private static double ToDouble(JsonValue value) =>
        double.Parse(JsonText.NumberText(value), NumberStyles.Float, CultureInfo.InvariantCulture);

    private static bool IsNumber(JsonNode? node) =>
        node is JsonValue value && value.GetValueKind() == JsonValueKind.Number;

    private static bool IsString(JsonNode? node) =>
        node is JsonValue value && value.GetValueKind() == JsonValueKind.String;

    private static int? GenericCount(object? value)
    {
        if (value is null)
        {
            return null;
        }

        foreach (var face in value.GetType().GetInterfaces())
        {
            if (face.IsGenericType &&
                (face.GetGenericTypeDefinition() == typeof(IReadOnlyCollection<>) ||
                 face.GetGenericTypeDefinition() == typeof(ICollection<>)))
            {
                return (int?)face.GetProperty("Count")!.GetValue(value);
            }
        }

        return value is IEnumerable enumerable and not string ? enumerable.Cast<object?>().Count() : null;
    }

    private static JsonNode? Walk(object? value, HashSet<object> seen)
    {
        switch (value)
        {
            case null:
                return null;
            case string text:
                return JsonValue.Create(text);
            case bool flag:
                return JsonValue.Create(flag);
            case char c:
                return JsonValue.Create(c.ToString());
            case Rune rune:
                return JsonValue.Create(rune.ToString());
            case sbyte or byte or short or ushort or int or uint or long:
                return WholeNumber(new BigInteger(Convert.ToInt64(value, CultureInfo.InvariantCulture)));
            case ulong big:
                return WholeNumber(new BigInteger(big));
            case BigInteger big:
                return WholeNumber(big);
            case Int128 big:
                return WholeNumber((BigInteger)big);
            case UInt128 big:
                return WholeNumber((BigInteger)big);
            case float real:
                return Number(real);
            case double real:
                return Number(real);
            case Half real:
                return Number((double)real);
            case decimal dec:
                return dec == decimal.Truncate(dec)
                    ? WholeNumber(new BigInteger(dec))
                    : JsonValue.Create((double)dec);
            case DateTimeOffset instant:
                return JsonValue.Create(Timestamp(instant));
            case DateTime time:
                return JsonValue.Create(Timestamp(time.Kind == DateTimeKind.Unspecified
                    ? new DateTimeOffset(DateTime.SpecifyKind(time, DateTimeKind.Utc))
                    : new DateTimeOffset(time)));
            case DateOnly date:
                return JsonValue.Create(Timestamp(new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero)));
            case TimeSpan span:
                return JsonValue.Create(span.ToString("c", CultureInfo.InvariantCulture));
            case Guid or Uri or Version or TimeOnly:
                return JsonValue.Create(Convert.ToString(value, CultureInfo.InvariantCulture));
            case Enum:
                return JsonValue.Create(value.ToString());
            case Regex regex:
                return JsonValue.Create(regex.ToString());
            case byte[] bytes:
                return Bytes(bytes);
            case ReadOnlyMemory<byte> memory:
                return Bytes(memory.ToArray());
            case Memory<byte> memory:
                return Bytes(memory.ToArray());
            case ArraySegment<byte> segment:
                return Bytes(segment.ToArray());
            case JsonElement element:
                return FromJson(JsonNode.Parse(element.GetRawText()), seen);
            case JsonNode node:
                return FromJson(node, seen);
            case Delegate or Exception or Task or Pointer or Type or MemberInfo:
                return JsonValue.Create(Unserialisable(value));
            case ITuple tuple when value.GetType().IsValueType:
                return Enter(value, seen, () =>
                {
                    var array = new JsonArray();
                    for (var i = 0; i < tuple.Length; i++)
                    {
                        array.Add(Walk(tuple[i], seen));
                    }

                    return array;
                });
        }

        var type = value.GetType();
        if (IsValueTask(type) || type.IsPointer || type.IsByRefLike)
        {
            return JsonValue.Create(Unserialisable(value));
        }

        if (value is IDictionary dictionary)
        {
            return Enter(value, seen, () => Map(dictionary.Keys.Cast<object>().Select(k => (k, dictionary[k])), seen));
        }

        if (ReadOnlyDictionaryPairs(value) is { } pairs)
        {
            return Enter(value, seen, () => Map(pairs, seen));
        }

        if (IsSet(type))
        {
            return Enter(value, seen, () =>
            {
                var items = ((IEnumerable)value).Cast<object?>().Select(item => Walk(item, seen));
                return new JsonArray([.. Sort(items).Select(Detach)]);
            });
        }

        if (value is IEnumerable enumerable)
        {
            return Enter(value, seen, () =>
            {
                var array = new JsonArray();
                foreach (var item in enumerable)
                {
                    array.Add(Walk(item, seen));
                }

                return array;
            });
        }

        return Enter(value, seen, () => Properties(value, seen));
    }

    private static JsonNode? Detach(JsonNode? node) => node?.Parent is null ? node : node.DeepClone();

    private static JsonNode Enter(object value, HashSet<object> seen, Func<JsonNode> build)
    {
        if (!seen.Add(value))
        {
            throw new CycleFound();
        }

        try
        {
            return build();
        }
        finally
        {
            seen.Remove(value);
        }
    }

    private static JsonObject Map(IEnumerable<(object Key, object? Value)> pairs, HashSet<object> seen)
    {
        var result = new JsonObject();
        foreach (var (key, item) in pairs)
        {
            var name = key as string ?? Key(Walk(key, seen));
            result[name] = Walk(item, seen);
        }

        return result;
    }

    private static JsonNode Properties(object value, HashSet<object> seen)
    {
        var result = new JsonObject();
        var type = value.GetType();
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (property.GetIndexParameters().Length > 0 || property.GetMethod is null)
            {
                continue;
            }

            object? item;
            try
            {
                item = property.GetValue(value);
            }
            catch (TargetInvocationException)
            {
                return JsonValue.Create(Unserialisable(value));
            }

            result[property.Name] = Walk(item, seen);
        }

        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
        {
            result[field.Name] = Walk(field.GetValue(value), seen);
        }

        return result;
    }

    private static JsonNode? FromJson(JsonNode? node, HashSet<object> seen) => node switch
    {
        null => null,
        JsonArray array => new JsonArray([.. array.Select(item => FromJson(item, seen))]),
        JsonObject obj => Map(obj.Select(pair => ((object)pair.Key, (object?)pair.Value)), seen),
        JsonValue scalar => scalar.GetValueKind() switch
        {
            JsonValueKind.Number => JsonNumber(scalar),
            JsonValueKind.String => JsonValue.Create(scalar.GetValue<string>()),
            JsonValueKind.True => JsonValue.Create(true),
            JsonValueKind.False => JsonValue.Create(false),
            _ => null,
        },
        _ => null,
    };

    private static JsonNode JsonNumber(JsonValue scalar)
    {
        if (scalar.TryGetValue<JsonElement>(out var element))
        {
            return element.TryGetInt64(out var whole) ? WholeNumber(whole) : Number(element.GetDouble());
        }

        return scalar.TryGetValue<long>(out var l) ? WholeNumber(l) : Number(scalar.GetValue<double>());
    }

    private static JsonObject Bytes(byte[] bytes) => new() { ["$bytes"] = Convert.ToBase64String(bytes) };

    private static bool IsValueTask(Type type) =>
        type == typeof(ValueTask) || (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(ValueTask<>));

    private static bool IsSet(Type type) =>
        type.GetInterfaces().Any(face => face.IsGenericType &&
            (face.GetGenericTypeDefinition() == typeof(ISet<>) || face.GetGenericTypeDefinition() == typeof(IReadOnlySet<>)));

    private static List<(object Key, object? Value)>? ReadOnlyDictionaryPairs(object value)
    {
        var face = value.GetType().GetInterfaces().FirstOrDefault(i =>
            i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IReadOnlyDictionary<,>));
        if (face is null)
        {
            return null;
        }

        var pairs = new List<(object Key, object? Value)>();
        foreach (var pair in (IEnumerable)value)
        {
            var pairType = pair!.GetType();
            pairs.Add((pairType.GetProperty("Key")!.GetValue(pair)!, pairType.GetProperty("Value")!.GetValue(pair)));
        }

        return pairs;
    }

    private sealed class CycleFound : Exception
    {
    }
}
