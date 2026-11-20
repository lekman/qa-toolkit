using System.Numerics;

namespace Lekman.Qualify.Conformance;

public class ValueNormalisationTests
{
    [OQ("OQ-CONF-017", "value-normalisation test", Given = Fixture.Given, When = Fixture.When, Then = Fixture.Then, Scope = Scope.Read)]
    public void ValuesAreNormalised()
    {
        var ctx = QualifyContext.Current;
        byte[] bytes = [0x01, 0x02];
        var instant = new DateTimeOffset(2026, 1, 2, 3, 4, 5, 6, TimeSpan.Zero);
        var big = BigInteger.Pow(2, 60);
        var nan = double.NaN;
        var map = new Dictionary<string, object> { ["b"] = 1, ["a"] = new Dictionary<string, object> { ["d"] = 2, ["c"] = 3 } };
        var set = new HashSet<string> { "b", "a" };
        var cycle = new List<object>();
        cycle.Add(cycle);

        ctx.Check("value", "bytes").That(bytes).IsEqualTo(bytes);
        ctx.Check("value", "instant").That(instant).IsEqualTo(instant);
        ctx.Check("value", "big integer").That(big).IsEqualTo(big);
        ctx.Check("value", "NaN").That(nan).IsEqualTo(nan);
        ctx.Check("value", "map").That(map).IsEqualTo(map);
        ctx.Check("value", "set").That(set).IsEqualTo(set);
        ctx.Check("value", "cycle").That(cycle).IsEqualTo(cycle);
    }
}
