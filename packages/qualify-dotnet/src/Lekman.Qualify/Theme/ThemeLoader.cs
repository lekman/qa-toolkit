using System.Text.Json;
using System.Text.Json.Nodes;

namespace Lekman.Qualify.Theme;

/// <summary>Reads theme files from disk.</summary>
public interface IThemeFiles
{
    /// <summary>Read a file's bytes.</summary>
    byte[] ReadBytes(string path);
}

/// <summary>
/// The two themes the package bundles, <c>lekman</c> and <c>plain</c>,
/// embedded byte for byte from <c>spec/qualify/report/themes/</c>.
/// </summary>
public static class BundledThemes
{
    /// <summary>The bundled theme names.</summary>
    public static IReadOnlyList<string> Names { get; } = ["lekman", "plain"];

    /// <summary>The default theme.</summary>
    public const string Default = "lekman";

    private const string Prefix = "Lekman.Qualify.themes/";

    private static readonly Lazy<Dictionary<string, string>> Resources = new(() =>
        typeof(BundledThemes).Assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(Prefix, StringComparison.Ordinal))
            .ToDictionary(name => name[Prefix.Length..].Replace('\\', '/'), name => name, StringComparer.Ordinal));

    /// <summary>The bundled files, as paths relative to the themes folder: <c>lekman/theme.json</c>.</summary>
    public static IReadOnlyCollection<string> Files => Resources.Value.Keys;

    /// <summary>Read a bundled file by its path relative to the themes folder, or null when there is none.</summary>
    public static byte[]? Read(string relativePath)
    {
        if (!Resources.Value.TryGetValue(relativePath.Replace('\\', '/'), out var name))
        {
            return null;
        }

        using var stream = typeof(BundledThemes).Assembly.GetManifestResourceStream(name)!;
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    }
}

/// <summary>Loads a report theme by bundled name or by path, section 9.3 of the specification.</summary>
public static class ThemeLoader
{
    private const string BundledRoot = "bundled:";

    /// <summary>
    /// Load and check a theme: the schema, the tokens in its texts, and every
    /// file it names. Any problem throws <see cref="ThemeException"/>.
    /// </summary>
    /// <param name="reference">A bundled theme name, or a path to a theme file.</param>
    /// <param name="workingDirectory">The folder a relative path is resolved against.</param>
    /// <param name="files">Reads files from disk.</param>
    public static ReportTheme Load(string reference, string workingDirectory, IThemeFiles files)
    {
        ArgumentNullException.ThrowIfNull(reference);
        ArgumentNullException.ThrowIfNull(files);
        var bundled = BundledThemes.Names.Contains(reference);
        var path = bundled ? $"{BundledRoot}{reference}/theme.json" : Path.GetFullPath(reference, workingDirectory);

        byte[] Read(string file, string what)
        {
            try
            {
                if (file.StartsWith(BundledRoot, StringComparison.Ordinal))
                {
                    return BundledThemes.Read(file[BundledRoot.Length..])
                        ?? throw new FileNotFoundException($"no bundled file {file[BundledRoot.Length..]}");
                }

                return files.ReadBytes(file);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                throw new ThemeException($"{path}: {what} {file} cannot be read ({error.Message})");
            }
        }

        JsonNode? data;
        try
        {
            data = JsonNode.Parse(Read(path, "the theme file"));
        }
        catch (JsonException error)
        {
            throw new ThemeException($"{path}: not valid JSON ({error.Message})");
        }

        var problems = ThemeSchema.Problems(data);
        if (problems.Count > 0)
        {
            throw new ThemeException($"{path}: {string.Join("; ", problems)}");
        }

        var spec = ThemeSpec.FromJson((JsonObject)data!);
        Template.Validate(
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["title"] = spec.Texts.Title,
                ["subtitle"] = spec.Texts.Subtitle,
                ["classification"] = spec.Texts.Classification,
                ["header"] = spec.Texts.Header,
                ["footer"] = spec.Texts.Footer,
            },
            path);

        var loaded = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        var fonts = new Dictionary<FontSlot, byte[]>();
        foreach (var slot in Enum.GetValues<FontSlot>())
        {
            var file = Resolve(path, spec.Fonts[slot]);
            if (!loaded.TryGetValue(file, out var bytes))
            {
                var slotName = char.ToLowerInvariant(slot.ToString()[0]) + slot.ToString()[1..];
                bytes = Read(file, $"fonts.{slotName}");
                if (FontProblem(bytes) is { } problem)
                {
                    throw new ThemeException($"{path}: fonts.{slotName} {file} {problem}");
                }

                loaded[file] = bytes;
            }

            fonts[slot] = bytes;
        }

        byte[]? logo = null;
        if (spec.Logo is not null)
        {
            var file = Resolve(path, spec.Logo);
            logo = Read(file, "brand.logo");
            if (!IsPng(logo) && !IsJpeg(logo))
            {
                throw new ThemeException($"{path}: brand.logo {file} is not a PNG or JPEG image");
            }
        }

        return new ReportTheme { Spec = spec, Fonts = fonts, Logo = logo };
    }

    /// <summary>Whether a font file is a TrueType or OpenType font, and not a variable one.</summary>
    public static string? FontProblem(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (bytes.Length < 12)
        {
            return "is not a TrueType or OpenType font";
        }

        var tag = System.Text.Encoding.ASCII.GetString(bytes, 0, 4);
        if (!(bytes[0] == 0 && bytes[1] == 1 && bytes[2] == 0 && bytes[3] == 0) && tag != "true" && tag != "OTTO")
        {
            return "is not a TrueType or OpenType font";
        }

        var tables = (bytes[4] << 8) | bytes[5];
        for (var i = 0; i < tables; i++)
        {
            var at = 12 + (16 * i);
            if (at + 4 <= bytes.Length && System.Text.Encoding.ASCII.GetString(bytes, at, 4) == "fvar")
            {
                return "is a variable font, which is not supported";
            }
        }

        return null;
    }

    private static bool IsPng(byte[] bytes) => bytes is [0x89, 0x50, 0x4E, 0x47, ..];

    private static bool IsJpeg(byte[] bytes) => bytes is [0xFF, 0xD8, 0xFF, ..];

    private static string Resolve(string themePath, string relative)
    {
        if (themePath.StartsWith(BundledRoot, StringComparison.Ordinal))
        {
            var folder = themePath[BundledRoot.Length..themePath.LastIndexOf('/')];
            return BundledRoot + Normalise($"{folder}/{relative}");
        }

        return Path.GetFullPath(relative, Path.GetDirectoryName(themePath)!);
    }

    private static string Normalise(string path)
    {
        var parts = new List<string>();
        foreach (var part in path.Replace('\\', '/').Split('/'))
        {
            if (part == "..")
            {
                if (parts.Count > 0)
                {
                    parts.RemoveAt(parts.Count - 1);
                }
            }
            else if (part.Length > 0 && part != ".")
            {
                parts.Add(part);
            }
        }

        return string.Join('/', parts);
    }
}
