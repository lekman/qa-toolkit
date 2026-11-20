using System.Numerics;
using System.Text.RegularExpressions;

namespace Lekman.Qualify.Envelope;

/// <summary>ULIDs: 48 bits of milliseconds and 80 random bits, in Crockford base32.</summary>
public static partial class Ulid
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    /// <summary>
    /// Create a ULID from a time in milliseconds and 10 random bytes. The
    /// bytes are passed in so the result is reproducible in tests.
    /// </summary>
    public static string Create(long milliseconds, ReadOnlySpan<byte> random)
    {
        if (milliseconds < 0 || milliseconds >= 1L << 48)
        {
            throw new ArgumentOutOfRangeException(nameof(milliseconds), "ULID time must be a 48-bit count of milliseconds");
        }

        if (random.Length != 10)
        {
            throw new ArgumentException("ULID randomness must be 10 bytes", nameof(random));
        }

        var chars = new char[26];
        var rest = milliseconds;
        for (var i = 9; i >= 0; i--)
        {
            chars[i] = Alphabet[(int)(rest % 32)];
            rest /= 32;
        }

        var bits = new BigInteger(random, isUnsigned: true, isBigEndian: true);
        for (var i = 25; i >= 10; i--)
        {
            chars[i] = Alphabet[(int)(bits & 31)];
            bits >>= 5;
        }

        return new string(chars);
    }

    /// <summary>A new ULID for now.</summary>
    public static string New() =>
        Create(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), System.Security.Cryptography.RandomNumberGenerator.GetBytes(10));

    /// <summary>Whether a string is a ULID.</summary>
    public static bool IsValid(string? value) => value is not null && UlidRegex().IsMatch(value);

    [GeneratedRegex("^[0-9A-HJKMNP-TV-Z]{26}$")]
    private static partial Regex UlidRegex();
}
