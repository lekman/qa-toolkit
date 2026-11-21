using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Lekman.Qualify.Evidence;

/// <summary>A record or marker file name, split into its parts.</summary>
public sealed record EvidenceName(string RunId, string TestId, string Key, bool IsMarker)
{
    /// <summary>The name without its extension, shared by a marker and its record.</summary>
    public string Stem => $"{RunId}__{TestId}__{Key}";
}

/// <summary>File names and paths inside an evidence directory, section 6 of the specification.</summary>
public static partial class EvidenceFiles
{
    /// <summary>The run file name.</summary>
    public const string RunFile = "test-evidence.json";

    /// <summary>The folder for records and markers inside the evidence directory.</summary>
    public const string RecordsFolder = "records";

    /// <summary>
    /// The instance key: the first 8 hex digits of the SHA-256 of the
    /// declaration's site. A retried test overwrites its own files; a second
    /// declaration of the same ID writes beside them, so merge can refuse it.
    /// </summary>
    public static string Key(string site) => Sha256(Encoding.UTF8.GetBytes(site))[..8];

    /// <summary><c>&lt;runId&gt;__&lt;testId&gt;__&lt;key&gt;.started</c></summary>
    public static string Marker(string runId, string testId, string key) => $"{runId}__{testId}__{key}.started";

    /// <summary><c>&lt;runId&gt;__&lt;testId&gt;__&lt;key&gt;.json</c></summary>
    public static string Record(string runId, string testId, string key) => $"{runId}__{testId}__{key}.json";

    /// <summary>Split a record or marker file name, or null for any other name.</summary>
    public static EvidenceName? Parse(string name)
    {
        var match = NameRegex().Match(name);
        return match.Success
            ? new EvidenceName(match.Groups[1].Value, match.Groups[2].Value, match.Groups[3].Value, match.Groups[4].Value == "started")
            : null;
    }

    /// <summary>The <c>.sha256</c> sidecar text: digest, two spaces, file name, newline.</summary>
    public static string Sidecar(byte[] content, string fileName) => $"{Sha256(content)}  {fileName}\n";

    /// <summary>The lowercase hex SHA-256 of bytes.</summary>
    public static string Sha256(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

    [GeneratedRegex(@"^([0-9A-HJKMNP-TV-Z]{26})__((?:IQ|OQ|PQ|IU)-[A-Z][A-Z0-9]{1,15}-[0-9]{3,})__([0-9a-f]{8})\.(started|json)$")]
    private static partial Regex NameRegex();
}
