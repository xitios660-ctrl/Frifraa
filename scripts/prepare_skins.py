"""Compress generated transparent character artwork for the mobile game.

Usage: python scripts/prepare_skins.py mary=/path/to/mary.png kaique=/path/to/kaique.png
Run from repository root. Source images are never modified.
"""

from pathlib import Path
import sys

from PIL import Image


def prepare(spec: str) -> Path:
    name, source = spec.split('=', 1)
    if not name.isascii() or not name.isalpha():
        raise ValueError('Skin name must contain ASCII letters only')
    image = Image.open(source).convert('RGBA')
    # Preserve the full character while removing unused alpha padding.
    bounds = image.getchannel('A').getbbox()
    if not bounds:
        raise ValueError(f'No visible pixels in {source}')
    image = image.crop(bounds)
    image.thumbnail((294, 294), Image.Resampling.LANCZOS)
    output = Image.new('RGBA', (320, 320), (0, 0, 0, 0))
    output.alpha_composite(image, ((320 - image.width) // 2, (320 - image.height) // 2))
    destination = Path('public/skins') / (name.lower() + '.webp')
    destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(destination, format='WEBP', quality=87, method=6, exact=True)
    return destination


if __name__ == '__main__':
    for source in sys.argv[1:]:
        print(prepare(source))
