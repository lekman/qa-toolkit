# Graded Test Data

The reasoning behind [@lekman/data-sampler](../../packages/data-sampler/README.md).

## The Problem

Random test data is not assertable. A generator that produces a plausible
patient, order or reading tells you nothing about whether that record should
pass or fail the code under test. You end up either asserting on nothing
("it did not crash") or writing a second classifier in the test to decide,
after the fact, what the generator meant. Two implementations of the same
rule, and the test now checks whether they agree with each other.

Base loads have the same gap from the other side. "A thousand customers, a
few of them problematic" is easy to say and hard to produce: draw at random
and the problematic ones are however many the dice gave you, so a test that
counts them cannot be written.

## The Pattern

1. **Grade first.** Decide the grade of every record before generating a
   single value. The grade is part of the input, not a property discovered
   afterwards.
2. **Generate to satisfy.** Every field generator receives the grade and
   produces a value that fits it. A `warning` record has warning-band values
   in every graded field, by construction.
3. **Allocate exactly.** Turn the spread into integer counts by largest
   remainder, then shuffle with the seed. A thousand records at 90/10 are 900
   and 100, and a test can say so.
4. **Tag every record.** Carry the grade, the index and the seed on the
   record so a test can group by grade and any run can be repeated. Strip the
   tag for a base load.

The consequence is a test that reads as a specification: "every `ill` record
is rejected; every `normal` record is accepted; the run held 20 of one and 140
of the other."

## Where It Applies, and Where It Does Not

It applies wherever the code under test makes a decision about a record and
you want to assert on that decision: validators, classifiers, alerting rules,
intake pipelines, anything with a threshold. It applies to fixtures and base
loads where the mix matters and the count must be known.

It does not apply when the point is realism. A load test that wants the
noise of a real population, with a plausible number of edge cases rather than
an exact one, needs a probabilistic sampler that draws grades by weight
instead of allocating them. That sampler does not exist yet; when it does, it
will be an opt-in on the same dataset definition, not a replacement.

It also does not solve field-level mixtures. A record that is normal in most
fields and off in one is either a grade of its own or a field whose generator
sometimes returns a normal value for a non-normal grade. Both are choices for
the dataset author; the tool does not guess.
