using System.Diagnostics;

namespace Lekman.Qualify.Evidence;

/// <summary>
/// Sites: the repository-relative <c>path:line</c> of a declaration, a check or
/// a failure. Paths come from the compiler (<c>[CallerFilePath]</c>) and from
/// the PDB of a stack frame, which name the same file the same way.
/// </summary>
public static class Sites
{
    /// <summary>
    /// Format a source path and line as <c>path:line</c>, relative to
    /// <paramref name="root"/> with forward slashes. A path a deterministic CI
    /// build mapped to <c>/_/</c> is already relative to the repository root.
    /// A path outside the root keeps its file name only.
    /// </summary>
    public static string Format(string? path, int line, string root)
    {
        var relative = Relative(path ?? "unknown", root);
        relative = relative.Replace(':', '_').Replace('\n', '_');
        return $"{relative}:{Math.Max(line, 0)}";
    }

    /// <summary>
    /// The innermost frame of an exception's stack that lies in a file, as a
    /// path and line, or null when no frame names that file.
    /// </summary>
    public static (string Path, int Line)? InFile(Exception exception, string file)
    {
        var frames = new StackTrace(exception, fNeedFileInfo: true).GetFrames();
        foreach (var frame in frames)
        {
            var name = frame.GetFileName();
            if (name is not null && SamePath(name, file) && frame.GetFileLineNumber() > 0)
            {
                return (name, frame.GetFileLineNumber());
            }
        }

        return null;
    }

    /// <summary>Whether two source paths name the same file.</summary>
    public static bool SamePath(string a, string b) =>
        string.Equals(
            a.Replace('\\', '/'),
            b.Replace('\\', '/'),
            OperatingSystem.IsWindows() || OperatingSystem.IsMacOS() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal);

    private static string Relative(string path, string root)
    {
        var normal = path.Replace('\\', '/');
        if (normal.StartsWith("/_/", StringComparison.Ordinal))
        {
            return normal[3..];
        }

        if (!Path.IsPathRooted(path))
        {
            return normal;
        }

        var relative = Path.GetRelativePath(root, path).Replace('\\', '/');
        if (relative.StartsWith("../", StringComparison.Ordinal) || relative == ".." || Path.IsPathRooted(relative) || relative.Contains(':'))
        {
            return Path.GetFileName(path);
        }

        return relative;
    }
}
