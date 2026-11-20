using System.Reflection;
using Xunit.v3;

[assembly: Lekman.Qualify.Conformance.WorkerLog]

namespace Lekman.Qualify.Conformance;

/// <summary>
/// Harness-only: records the thread that ran each test, so the
/// parallel-determinism scenario can prove it ran on at least two threads.
/// Writes nothing when CONFORMANCE_WORKER_LOG is not set.
/// </summary>
[AttributeUsage(AttributeTargets.Assembly)]
internal sealed class WorkerLogAttribute : BeforeAfterTestAttribute
{
    private static readonly Lock Gate = new();

    public override void Before(MethodInfo methodUnderTest, IXunitTest test)
    {
        var log = Environment.GetEnvironmentVariable("CONFORMANCE_WORKER_LOG");
        if (string.IsNullOrEmpty(log))
        {
            return;
        }

        lock (Gate)
        {
            File.AppendAllText(log, $"{Environment.ProcessId}:{Environment.CurrentManagedThreadId}\n");
        }
    }
}
