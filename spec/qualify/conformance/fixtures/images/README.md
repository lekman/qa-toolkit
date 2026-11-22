# Image Fixtures

The images that scenario 23, `report-images`, attaches. Every language reads
these files, so every run records the same bytes and the same digests.

| File         | Format | Pixels    | Shows                                                        |
| ------------ | ------ | --------- | ------------------------------------------------------------ |
| `screen.png` | PNG    | 960 x 540 | A screenshot-like page, wider than the text width            |
| `tall.jpg`   | JPEG   | 200 x 600 | Six coloured bands, taller than the height limit             |
| `icon.png`   | PNG    | 48 x 48   | A blue circle on a transparent background, drawn at its size |

They were drawn with Pillow and are part of the specification. Changing one
changes `expected/report-images.json` and `expected/report-images.outline.txt`.
