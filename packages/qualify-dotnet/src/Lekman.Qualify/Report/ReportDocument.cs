using Lekman.Qualify.Theme;

namespace Lekman.Qualify.Report;

/// <summary>One column of a table: its header, its share of the text width, and whether it is mono.</summary>
public sealed record Column(string Header, double Width, bool Mono = false);

/// <summary>One label and value of a field list.</summary>
public sealed record Field(string Label, string Value, bool Mono = false);

/// <summary>A piece of report content after the cover, laid out in order.</summary>
public abstract record Block;

/// <summary>A heading of level 1, 2 or 3.</summary>
public sealed record HeadingBlock(int Level, string Text) : Block;

/// <summary>A paragraph of body text.</summary>
public sealed record ParagraphBlock(string Text) : Block;

/// <summary>A bulleted list.</summary>
public sealed record ListBlock(IReadOnlyList<string> Items) : Block;

/// <summary>A field list: labels and values, no fill.</summary>
public sealed record FieldsBlock(IReadOnlyList<Field> Fields) : Block;

/// <summary>A table with a header row and zebra body rows.</summary>
public sealed record TableBlock(IReadOnlyList<Column> Columns, IReadOnlyList<IReadOnlyList<string>> Rows) : Block;

/// <summary>The signature block: one row per role.</summary>
public sealed record SignaturesBlock(IReadOnlyList<string> Roles) : Block;

/// <summary>What the cover page shows, section 9.1 of the specification.</summary>
public sealed record Cover(string? BrandName, string Title, string Subtitle, IReadOnlyList<Field> Fields);

/// <summary>The PDF's document information.</summary>
public sealed record ReportMetadata(string Title, string Subject, string Keywords, string Producer, DateTimeOffset CreationDate);

/// <summary>Everything the renderer needs: cover, content, page texts and metadata.</summary>
public sealed record ReportDocument
{
    /// <summary>The content after the cover.</summary>
    public required IReadOnlyList<Block> Blocks { get; init; }

    /// <summary>The classification, drawn on the right of every header.</summary>
    public required string Classification { get; init; }

    /// <summary>The cover page.</summary>
    public required Cover Cover { get; init; }

    /// <summary>The header template; <c>{page}</c> and <c>{pages}</c> are filled per page.</summary>
    public required string Header { get; init; }

    /// <summary>The footer template; <c>{page}</c> and <c>{pages}</c> are filled per page.</summary>
    public required string Footer { get; init; }

    /// <summary>Token values for the header and footer.</summary>
    public required TokenValues Tokens { get; init; }

    /// <summary>The PDF's document information.</summary>
    public required ReportMetadata Metadata { get; init; }
}

/// <summary>What the caller asked for. A value left null comes from the theme.</summary>
public sealed record ReportOptions
{
    /// <summary>The generation time.</summary>
    public required DateTimeOffset GeneratedAt { get; init; }

    /// <summary>The title, used as written.</summary>
    public string? Title { get; init; }

    /// <summary>The subtitle, used as written.</summary>
    public string? Subtitle { get; init; }

    /// <summary>The document ID, used as written.</summary>
    public string? DocumentId { get; init; }

    /// <summary>The classification, used as written.</summary>
    public string? Classification { get; init; }

    /// <summary>Whether <see cref="Signatures"/> replaces the theme's roles.</summary>
    public bool SignaturesGiven { get; init; }

    /// <summary>Signature roles; empty for no signature block.</summary>
    public IReadOnlyList<string> Signatures { get; init; } = [];
}
