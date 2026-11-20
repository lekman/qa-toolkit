using System.Diagnostics;

namespace Lekman.Qualify.Envelope;

/// <summary>Reads the commit, branch and state of the working tree by running <c>git</c>.</summary>
public interface IGitProbe
{
    /// <summary>The facts for a folder. Every value is null when git cannot tell.</summary>
    GitFacts Read(string folder);
}

/// <summary>Runs the <c>git</c> executable. System layer: no logic beyond the calls.</summary>
public sealed class GitProbe : IGitProbe
{
    /// <inheritdoc />
    public GitFacts Read(string folder)
    {
        var root = Git(folder, "rev-parse", "--show-toplevel");
        if (root is null)
        {
            return GitFacts.None;
        }

        // Tracked files only: the evidence directory usually sits untracked in
        // the repository, and counting it would change dirty partway through a run.
        var status = Git(folder, "status", "--porcelain", "--untracked-files=no");
        return new GitFacts(
            root,
            Git(folder, "rev-parse", "HEAD"),
            Git(folder, "symbolic-ref", "--quiet", "--short", "HEAD"),
            status is null ? null : status.Length > 0);
    }

    private static string? Git(string folder, params string[] args)
    {
        try
        {
            var start = new ProcessStartInfo("git")
            {
                WorkingDirectory = folder,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                UseShellExecute = false,
            };
            foreach (var arg in args)
            {
                start.ArgumentList.Add(arg);
            }

            using var process = Process.Start(start);
            if (process is null)
            {
                return null;
            }

            process.StandardInput.Close();
            var errors = process.StandardError.ReadToEndAsync();
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit();
            _ = errors.Result;
            return process.ExitCode == 0 ? output.Trim() : null;
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or IOException or InvalidOperationException)
        {
            return null;
        }
    }
}
