using System.ComponentModel;
using System.Reflection;
using Lekman.Qualify.Execution;
using Xunit.Sdk;
using Xunit.v3;

namespace Lekman.Qualify.Runner;

/// <summary>
/// A qualification test case. It runs itself through qualify's own test
/// runner, which wraps the method body: started marker, policy, context,
/// body, outcome, redacted record. It holds no state beyond an ordinary xUnit
/// test case, so it serialises the same way; the declaration is read from the
/// method's attribute when the test runs.
/// </summary>
public sealed class QualifyTestCase : XunitTestCase, ISelfExecutingXunitTestCase
{
    /// <summary>For the deserialiser only.</summary>
    [EditorBrowsable(EditorBrowsableState.Never)]
    [Obsolete("Called by the de-serializer; should only be called by deriving classes for de-serialization purposes")]
    public QualifyTestCase()
    {
    }

    /// <summary>Create the test case from the details xUnit resolved.</summary>
    public QualifyTestCase(
        IXunitTestMethod testMethod,
        string testCaseDisplayName,
        string uniqueID,
        bool @explicit,
        Type[]? skipExceptions,
        string? skipReason,
        Type? skipType,
        string? skipUnless,
        string? skipWhen,
        Dictionary<string, HashSet<string>> traits,
        string? sourceFilePath,
        int? sourceLineNumber,
        int? timeout)
        : base(
            testMethod,
            testCaseDisplayName,
            uniqueID,
            @explicit,
            skipExceptions,
            skipReason,
            skipType,
            skipUnless,
            skipWhen,
            traits,
            testMethodArguments: null,
            sourceFilePath: sourceFilePath,
            sourceLineNumber: sourceLineNumber,
            timeout: timeout)
    {
    }

    /// <inheritdoc />
    public async ValueTask<RunSummary> Run(
        ExplicitOption explicitOption,
        IMessageBus messageBus,
        object?[] constructorArguments,
        ExceptionAggregator aggregator,
        CancellationTokenSource cancellationTokenSource,
        ParallelMode parallelMode,
        ExecutionScheduler scheduler,
        FixtureMappingManager methodFixtureMappings)
    {
        var tests = await aggregator.RunAsync(CreateTests, []);
        if (aggregator.ToException() is { } exception)
        {
            return XunitRunnerHelper.FailTestCases(messageBus, cancellationTokenSource, [this], exception, false, false, false, true, true);
        }

        return await QualifyTestCaseRunner.Instance.Run(
            this,
            tests,
            messageBus,
            aggregator,
            cancellationTokenSource,
            parallelMode,
            scheduler,
            TestCaseDisplayName,
            SkipReason,
            explicitOption,
            constructorArguments,
            methodFixtureMappings);
    }

    /// <summary>The qualify attribute on the test method.</summary>
    internal QualifyAttribute Attribute =>
        TestMethod.Method.GetCustomAttribute<QualifyAttribute>()
            ?? throw new InvalidOperationException($"{TestMethodName} has no qualification attribute");
}

/// <summary>Runs a <see cref="QualifyTestCase"/> with qualify's own test runner.</summary>
public sealed class QualifyTestCaseRunner :
    XunitTestCaseRunnerBase<QualifyTestCaseRunnerContext, IXunitTestCase, IXunitTest>
{
    private QualifyTestCaseRunner()
    {
    }

    /// <summary>The shared instance.</summary>
    public static QualifyTestCaseRunner Instance { get; } = new();

    /// <summary>Run the tests of a test case.</summary>
    public async ValueTask<RunSummary> Run(
        IXunitTestCase testCase,
        IReadOnlyCollection<IXunitTest> tests,
        IMessageBus messageBus,
        ExceptionAggregator aggregator,
        CancellationTokenSource cancellationTokenSource,
        ParallelMode parallelMode,
        ExecutionScheduler scheduler,
        string displayName,
        string? skipReason,
        ExplicitOption explicitOption,
        object?[] constructorArguments,
        FixtureMappingManager methodFixtureMappings)
    {
        await using var context = new QualifyTestCaseRunnerContext(
            testCase,
            tests,
            explicitOption,
            messageBus,
            aggregator,
            displayName,
            skipReason,
            cancellationTokenSource,
            parallelMode,
            scheduler,
            constructorArguments,
            methodFixtureMappings);
        await context.InitializeAsync();
        return await Run(context);
    }
}

/// <summary>The test case runner's context: runs each test with <see cref="QualifyTestRunner"/>.</summary>
public sealed class QualifyTestCaseRunnerContext(
    IXunitTestCase testCase,
    IReadOnlyCollection<IXunitTest> tests,
    ExplicitOption explicitOption,
    IMessageBus messageBus,
    ExceptionAggregator aggregator,
    string displayName,
    string? skipReason,
    CancellationTokenSource cancellationTokenSource,
    ParallelMode parallelMode,
    ExecutionScheduler scheduler,
    object?[] constructorArguments,
    FixtureMappingManager methodFixtureMappings)
    : XunitTestCaseRunnerBaseContext<IXunitTestCase, IXunitTest>(
        testCase,
        tests,
        explicitOption,
        messageBus,
        aggregator,
        displayName,
        skipReason,
        cancellationTokenSource,
        parallelMode,
        scheduler,
        constructorArguments,
        methodFixtureMappings)
{
    /// <inheritdoc />
    public override ValueTask<RunSummary> RunTest(IXunitTest test) =>
        QualifyTestRunner.Instance.Run(
            test,
            MessageBus,
            ConstructorArguments,
            ExplicitOption,
            Aggregator.Clone(),
            CancellationTokenSource,
            ParallelMode,
            Scheduler,
            BeforeAfterTestAttributes,
            CaseFixtureMappings);
}

/// <summary>Runs one qualification test. Its context wraps the method call.</summary>
public sealed class QualifyTestRunner : XunitTestRunnerBase<QualifyTestRunnerContext, IXunitTest>
{
    private QualifyTestRunner()
    {
    }

    /// <summary>The shared instance.</summary>
    public static QualifyTestRunner Instance { get; } = new();

    /// <summary>Run a test.</summary>
    public async ValueTask<RunSummary> Run(
        IXunitTest test,
        IMessageBus messageBus,
        object?[] constructorArguments,
        ExplicitOption explicitOption,
        ExceptionAggregator aggregator,
        CancellationTokenSource cancellationTokenSource,
        ParallelMode parallelMode,
        ExecutionScheduler scheduler,
        IReadOnlyCollection<IBeforeAfterTestAttribute> beforeAfterAttributes,
        FixtureMappingManager caseFixtureMappings)
    {
        await using var context = new QualifyTestRunnerContext(
            test,
            explicitOption,
            messageBus,
            aggregator,
            cancellationTokenSource,
            parallelMode,
            scheduler,
            beforeAfterAttributes,
            constructorArguments,
            caseFixtureMappings);
        await context.InitializeAsync();
        return await Run(context);
    }
}

/// <summary>
/// The test runner's context. It replaces the plain method call with
/// <see cref="TestExecution.Run"/>, which writes the evidence around it.
/// </summary>
public sealed class QualifyTestRunnerContext(
    IXunitTest test,
    ExplicitOption explicitOption,
    IMessageBus messageBus,
    ExceptionAggregator aggregator,
    CancellationTokenSource cancellationTokenSource,
    ParallelMode parallelMode,
    ExecutionScheduler scheduler,
    IReadOnlyCollection<IBeforeAfterTestAttribute> beforeAfterTestAttributes,
    object?[] constructorArguments,
    FixtureMappingManager caseFixtureMappings)
    : XunitTestRunnerBaseContext<IXunitTest>(
        test,
        explicitOption,
        messageBus,
        aggregator,
        cancellationTokenSource,
        parallelMode,
        scheduler,
        beforeAfterTestAttributes,
        constructorArguments,
        caseFixtureMappings)
{
    /// <inheritdoc />
    protected override object? InvokeTestMethod(object? testClassInstance)
    {
        var attribute = ((QualifyTestCase)Test.TestCase).Attribute;
        var declaration = QualifyDiscoverer.Declare(attribute);
        return TestExecution.Run(
            declaration,
            attribute.SourceFilePath,
            () => base.InvokeTestMethod(testClassInstance),
            QualifyRuntime.Process());
    }
}
