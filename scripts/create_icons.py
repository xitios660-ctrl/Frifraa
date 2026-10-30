"""Create app icons from original, programmatically drawn artwork (Pillow)."""

from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1] / "public"
S = 1024
im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
d.rounded_rectangle((0, 0, S-1, S-1), radius=232, fill=(25, 15, 52, 255))

for y in range(S):
    alpha = y / S
    color = (int(49 - 25 * alpha), int(31 - 17 * alpha), int(92 - 43 * alpha), 255)
    d.line((0, y, S, y), fill=color, width=1)

# Restore transparent rounded corners.
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S-1, S-1), radius=232, fill=255)
layer.putalpha(mask)
im.alpha_composite(layer)
d = ImageDraw.Draw(im)
for y in (170, 820):
    d.line((180, y, 844, y), fill=(125, 80, 160, 53), width=14)

halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
hd = ImageDraw.Draw(halo)
hd.ellipse((192, 258, 832, 898), fill=(189, 105, 255, 135))
halo = halo.filter(ImageFilter.GaussianBlur(40))
im.alpha_composite(halo)
d = ImageDraw.Draw(im)

# Curved fuse and bright spark.
d.arc((522, 84, 775, 370), 165, 305, fill=(255, 226, 137, 255), width=46)
d.line((755, 92, 799, 48), fill=(255, 199, 93, 255), width=24)
d.line((775, 93, 827, 105), fill=(255, 199, 93, 255), width=24)
d.line((770, 85, 752, 35), fill=(255, 199, 93, 255), width=24)

# A glossy purple bomb, shaded with many concentric rings.
cx, cy, radius = 512, 579, 310
for r in range(radius, 0, -1):
    t = 1 - r / radius
    color = (
        int(70 + 110 * t),
        int(40 + 107 * t),
        int(136 + 116 * t),
        255,
    )
    d.ellipse((cx-r, cy-r, cx+r, cy+r), fill=color)

shine = Image.new("RGBA", (220, 112), (0, 0, 0, 0))
ImageDraw.Draw(shine).ellipse((2, 2, 218, 110), fill=(251, 240, 255, 215))
shine = shine.rotate(33, expand=True)
im.alpha_composite(shine, (300, 348))
d = ImageDraw.Draw(im)

d.rounded_rectangle((372, 558, 430, 660), radius=27, fill=(37, 24, 71, 255))
d.rounded_rectangle((594, 558, 652, 660), radius=27, fill=(37, 24, 71, 255))
d.arc((416, 652, 610, 732), 10, 170, fill=(37, 24, 71, 255), width=25)

for size in (192, 512, 180):
    icon = im.resize((size, size), Image.Resampling.LANCZOS)
    if size == 180:
        # iOS prefers an opaque icon.
        bg = Image.new("RGB", (size, size), (17, 11, 37))
        bg.paste(icon, mask=icon.getchannel("A"))
        icon = bg
    icon = icon.quantize(colors=192, method=Image.Quantize.FASTOCTREE)
    icon.save(ROOT / f"icon-{size}.png", optimize=True)
    print(f"Created icon-{size}.png")
