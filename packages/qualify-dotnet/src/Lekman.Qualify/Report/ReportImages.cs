using System.Text.Json.Nodes;

namespace Lekman.Qualify.Report;

/// <summary>
/// Image attachments in the report, section 9.2 of the specification: which
/// attachments are drawn, how large, and the lines that go with them. Pure:
/// the PDF library decodes the bytes later.
/// </summary>
public static class ReportImages
{
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] JpegSignature = [0xFF, 0xD8, 0xFF];

    /// <summary><c>&lt;file name&gt;, &lt;size&gt; bytes, SHA-256 &lt;first 12 characters of sha256&gt;</c></summary>
    public static string Caption(JsonObject attachment)
    {
        ArgumentNullException.ThrowIfNull(attachment);
        return $"{attachment["filename"]}, {attachment["sizeBytes"]} bytes, SHA-256 {((string)attachment["sha256"]!)[..12]}";
    }

    /// <summary>
    /// The size to draw an image at: one pixel is one point, scaled down to
    /// fit the box with its aspect ratio kept, and never scaled up.
    /// </summary>
    public static (double Width, double Height) Fit((double Width, double Height) pixels, (double Width, double Height) box)
    {
        var scale = Math.Min(1, Math.Min(box.Width / pixels.Width, box.Height / pixels.Height));
        return (pixels.Width * scale, pixels.Height * scale);
    }

    /// <summary>The image format of a content type, or null for one the report does not draw.</summary>
    public static ImageFormat? Format(string contentType) => contentType switch
    {
        "image/png" => ImageFormat.Png,
        "image/jpeg" => ImageFormat.Jpeg,
        _ => null,
    };

    /// <summary>Whether the bytes start with the signature of their format.</summary>
    public static bool HasSignature(byte[] bytes, ImageFormat format)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        return bytes.AsSpan().StartsWith(format == ImageFormat.Png ? PngSignature : JpegSignature);
    }

    /// <summary>The line drawn in place of an image that cannot be read.</summary>
    public static string Unreadable(JsonObject attachment)
    {
        ArgumentNullException.ThrowIfNull(attachment);
        return $"{attachment["filename"]} could not be read as {attachment["contentType"]}, so it is not drawn.";
    }
}
