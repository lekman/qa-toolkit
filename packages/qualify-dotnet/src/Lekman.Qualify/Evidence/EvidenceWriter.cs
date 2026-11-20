using System.Text;

namespace Lekman.Qualify.Evidence;

/// <summary>Writes evidence files.</summary>
public interface IEvidenceWriter
{
    /// <summary>Write a file atomically, creating its folder.</summary>
    void Write(string path, byte[] content);
}

/// <summary>Extensions for <see cref="IEvidenceWriter"/>.</summary>
public static class EvidenceWriterExtensions
{
    /// <summary>Write text as UTF-8 without a byte order mark.</summary>
    public static void Write(this IEvidenceWriter writer, string path, string text) =>
        writer.Write(path, new UTF8Encoding(false).GetBytes(text));
}

/// <summary>
/// Writes a file atomically: to a temporary file in the same folder, whose
/// name starts with a dot so <c>merge</c> skips it, then flushed to disk and
/// renamed over the target. System layer.
/// </summary>
public sealed class AtomicFileWriter : IEvidenceWriter
{
    /// <inheritdoc />
    public void Write(string path, byte[] content)
    {
        var folder = Path.GetDirectoryName(Path.GetFullPath(path))!;
        Directory.CreateDirectory(folder);
        var temporary = Path.Combine(folder, $".{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                stream.Write(content);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporary, path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporary))
            {
                File.Delete(temporary);
            }
        }
    }
}
