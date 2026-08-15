from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT.parent / "continuous_story_nings_anchor.jpg"
DESTINATION = ROOT / "assets" / "window_letter_nings_anchor_1024.jpg"

with Image.open(SOURCE) as image:
    image = image.convert("RGB")
    image = image.resize((1024, 576), Image.Resampling.LANCZOS)
    image.save(
        DESTINATION,
        format="JPEG",
        quality=82,
        optimize=True,
        progressive=True,
        subsampling=1,
    )

print(f"Prepared {DESTINATION} ({DESTINATION.stat().st_size} bytes)")
