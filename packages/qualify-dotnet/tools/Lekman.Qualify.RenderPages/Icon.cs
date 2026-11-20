using SkiaSharp;

namespace Lekman.Qualify.RenderPages;

/// <summary>Draws the package icon: a check mark on a rounded blue square.</summary>
internal static class Icon
{
    public static void Draw(string path)
    {
        const int size = 256;
        using var surface = SKSurface.Create(new SKImageInfo(size, size, SKColorType.Rgba8888, SKAlphaType.Premul));
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        using var fill = new SKPaint { Color = SKColor.Parse("#0284c7"), IsAntialias = true };
        canvas.DrawRoundRect(new SKRect(8, 8, size - 8, size - 8), 48, 48, fill);
        using var rule = new SKPaint { Color = SKColors.White.WithAlpha(110), IsAntialias = true, StrokeWidth = 10, StrokeCap = SKStrokeCap.Round };
        canvas.DrawLine(64, 196, 192, 196, rule);
        using var tick = new SKPaint
        {
            Color = SKColors.White,
            IsAntialias = true,
            Style = SKPaintStyle.Stroke,
            StrokeWidth = 26,
            StrokeCap = SKStrokeCap.Round,
            StrokeJoin = SKStrokeJoin.Round,
        };
        canvas.DrawLine(70, 112, 112, 154, tick);
        canvas.DrawLine(112, 154, 190, 70, tick);
        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        using var stream = File.Create(path);
        data.SaveTo(stream);
    }
}
