using System.Globalization;
using Lekman.Qualify.RenderPages;
using PDFtoImage;

// Usage: RenderPages <report.pdf> <out-prefix> [pages] [dpi]
// Writes <out-prefix>-1.png, <out-prefix>-2.png, ... for the first pages.
// RenderPages icon <out.png> draws the package icon.
if (args is ["icon", var iconPath])
{
    Icon.Draw(iconPath);
    return 0;
}

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: RenderPages <report.pdf> <out-prefix> [pages] [dpi]");
    return 64;
}

if (!OperatingSystem.IsWindows() && !OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
{
    Console.Error.WriteLine("RenderPages runs on Windows, Linux and macOS only, where PDFium is available");
    return 1;
}

var pdf = File.ReadAllBytes(args[0]);
var pages = args.Length > 2 ? int.Parse(args[2], CultureInfo.InvariantCulture) : 3;
var dpi = args.Length > 3 ? int.Parse(args[3], CultureInfo.InvariantCulture) : 110;
var count = Conversion.GetPageCount(pdf);
for (var page = 0; page < Math.Min(pages, count); page++)
{
    var output = $"{args[1]}-{page + 1}.png";
    Conversion.SavePng(output, pdf, page, options: new RenderOptions(Dpi: dpi, WithAnnotations: false, BackgroundColor: SkiaSharp.SKColors.White));
    Console.WriteLine(output);
}

return 0;
