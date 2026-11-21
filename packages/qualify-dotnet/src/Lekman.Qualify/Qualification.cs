using Lekman.Qualify.Execution;

namespace Lekman.Qualify;

/// <summary>Settings for qualification tests given in code.</summary>
public static class Qualification
{
    /// <summary>
    /// Give settings in code, the counterpart of a runner configuration file.
    /// Environment variables win when both are set. Call it before the first
    /// test runs, for example from a <c>[ModuleInitializer]</c> in the test project.
    /// </summary>
    /// <param name="options">The settings.</param>
    public static void Configure(QualifyOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        QualifyRuntime.Configure(options);
    }
}
