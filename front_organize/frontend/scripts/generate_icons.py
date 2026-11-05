"""Generate raster PWA icons from the Organize mark (no external assets)."""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]


def icon(size: int) -> None:
    scale = size / 192
    image = Image.new("RGB", (size, size), "#0b3f75")
    draw = ImageDraw.Draw(image)

    def box(coords):
        return tuple(round(n * scale) for n in coords)

    draw.rounded_rectangle(box((45, 32, 147, 160)), radius=round(14 * scale), fill="white")
    draw.rounded_rectangle(box((62, 54, 130, 72)), radius=round(6 * scale), fill="#38bdf8")
    draw.rounded_rectangle(box((62, 86, 130, 104)), radius=round(6 * scale), fill="#9be7ff")
    draw.rounded_rectangle(box((62, 118, 108, 136)), radius=round(6 * scale), fill="#d5f5ff")
    image.save(ROOT / "public" / f"icon-{size}.png", optimize=True)


for size in (192, 512):
    icon(size)
