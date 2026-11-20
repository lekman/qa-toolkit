# Report Themes

A theme decides how a qualification report looks: page size and margins, the
logo and brand name on the cover, fonts, colours, the cover's metadata rows, the
page header and footer texts, and the signature roles. The format is defined by
[report-theme.schema.json](../report-theme.schema.json) and described in
section 9.3 of the [specification](../README.md).

| Theme                              | Use it for                                                      |
| ---------------------------------- | --------------------------------------------------------------- |
| [lekman](themes/lekman/theme.json) | The default. The lekman.com logo, Geist fonts and colours.      |
| [plain](themes/plain/theme.json)   | No logo, black on white, Noto Sans for wide character coverage. |

## Make Your Own

1. Copy a theme folder, for example `themes/plain/`, into your own repository.
2. Change `theme.json`: your logo (PNG or JPEG), your fonts (static TrueType
   or OpenType files, not variable fonts), your colours and your texts.
3. Pass it to the report: `qualify report <run file> --pdf report.pdf --theme
path/to/theme.json`.

Every qualify package reads the same file, so one theme works for reports made
from TypeScript, Python, Java and C# test runs.

## What It Costs

- Fonts are embedded as subsets, so a report carries only the characters it
  uses. A character your font cannot draw prints as `?`. If your reports hold
  text in scripts your font does not cover, choose a font that does; the
  `plain` theme's Noto Sans covers Latin, Greek and Cyrillic.
- A theme folder is a few hundred kilobytes, almost all of it font files.

## Licences

- The fonts are under the SIL Open Font License 1.1; each `fonts/` folder
  carries its `OFL.txt`. Geist is by The Geist Project Authors; Noto Sans is by
  The Noto Project Authors.
- The `lekman` logo and the name lekman.com are Tobias Lekman's marks. They are not
  covered by this repository's MIT licence. Use the `plain` theme, or your own,
  for your reports.
