using System.Text;
using Lekman.Qualify.Cli;
using Lekman.Qualify.Envelope;
using Lekman.Qualify.Evidence;
using Lekman.Qualify.Execution;
using Lekman.Qualify.Merge;

namespace Lekman.Qualify.Tests;

/// <summary>Keeps written files in memory.</summary>
public sealed class MemoryWriter : IEvidenceWriter
{
    public Dictionary<string, byte[]> Files { get; } = [with(StringComparer.Ordinal)];

    public void Write(string path, byte[] content) => Files[path] = content;

    public string Text(string path) => Encoding.UTF8.GetString(Files[path]);
}

/// <summary>Git facts given in advance.</summary>
public sealed class FixedGit(GitFacts facts) : IGitProbe
{
    public GitFacts Read(string folder) => facts;
}

/// <summary>A process with fixed environment, time and git facts, writing to memory.</summary>
public sealed class MemoryRuntime : IRuntimeDependencies
{
    private DateTimeOffset now = new(2026, 1, 2, 3, 4, 5, 6, TimeSpan.Zero);

    public Dictionary<string, string> Variables { get; } = [with(StringComparer.Ordinal)];

    public List<string> Warnings { get; } = [];

    public MemoryWriter Files { get; } = new();

    public IReadOnlyDictionary<string, string> Environment => Variables;

    public string WorkingDirectory { get; set; } = "/work";

    public IGitProbe Git { get; set; } = new FixedGit(GitFacts.None);

    public IEvidenceWriter Writer => Files;

    public DateTimeOffset Now()
    {
        var current = now;
        now = now.AddMilliseconds(5);
        return current;
    }

    public void Warn(string message) => Warnings.Add(message);
}

/// <summary>Command I/O over in-memory files.</summary>
public sealed class MemoryIO : ICliIO
{
    public Dictionary<string, string> Variables { get; } = [with(StringComparer.Ordinal)];

    public Dictionary<string, byte[]> Disk { get; } = [with(StringComparer.Ordinal)];

    public MemoryWriter Files { get; } = new();

    public StringWriter Output { get; } = new();

    public StringWriter Errors { get; } = new();

    public IReadOnlyDictionary<string, string> Environment => Variables;

    public string WorkingDirectory { get; set; } = "/work";

    public IGitProbe Git { get; set; } = new FixedGit(GitFacts.None);

    public IEvidenceWriter Writer => Files;

    public TextWriter Out => Output;

    public TextWriter Err => Errors;

    public DateTimeOffset Now() => new(2026, 1, 2, 3, 4, 5, 6, TimeSpan.Zero);

    public byte[] ReadBytes(string path) =>
        Disk.TryGetValue(path, out var bytes) ? bytes
        : Files.Files.TryGetValue(path, out var written) ? written
        : File.Exists(path) ? File.ReadAllBytes(path)
        : throw new FileNotFoundException($"no file {path}");

    public IReadOnlyList<MergeInput> ReadRecords(string recordsDir) =>
        [.. Disk.Concat(Files.Files)
            .Where(pair => Path.GetDirectoryName(pair.Key) == recordsDir)
            .Select(pair => new MergeInput(Path.GetFileName(pair.Key), Encoding.UTF8.GetString(pair.Value)))];
}

/// <summary>Paths in the repository, for tests that read the specification.</summary>
public static class Repo
{
    public static string Root { get; } = Find();

    public static string Spec(params string[] parts) => Path.Combine([Root, "spec", "qualify", .. parts]);

    private static string Find()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "spec", "qualify")))
            {
                return dir.FullName;
            }
        }

        throw new InvalidOperationException("no repository root above " + AppContext.BaseDirectory);
    }
}
