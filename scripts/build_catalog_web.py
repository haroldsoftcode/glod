#!/usr/bin/env python3
"""Build local optimized GLOD product media from the public catalog source images.
Preserves product proportions and never changes source files on Google Drive.
"""
import io, json, re, time, pathlib, urllib.request, urllib.error, sys
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
match = re.search(r'<script type="application/json" id="data">([\s\S]*?)</script>', html)
if not match:
    sys.exit("Catalog JSON not found")
catalog = json.loads(match.group(1))
out = ROOT / "assets" / "catalogo-web"
out.mkdir(parents=True, exist_ok=True)
ok, errors = [], []

for n, item in enumerate(catalog, 1):
    sku = item["sku"]
    target = out / (sku + ".webp")
    if target.exists():
        ok.append(sku)
        continue
    src = item["imagen"]
    image_id = re.search(r'[?&]id=([^&]+)', src)
    urls = []
    if image_id:
        urls = [
            "https://drive.google.com/thumbnail?id=" + image_id.group(1) + "&sz=w1600",
            "https://drive.google.com/uc?export=download&id=" + image_id.group(1)
        ]
    urls.append(src)
    image = None
    last_error = ""
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (GLOD Catalog Build)"})
            with urllib.request.urlopen(req, timeout=35) as response:
                raw = response.read()
                if len(raw) > 20 * 1024 * 1024:
                    raise ValueError("Image too large")
            image = Image.open(io.BytesIO(raw)).convert("RGB")
            image.load()
            break
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.6)
    if image is None:
        errors.append((sku, last_error))
        print(f"FAIL {sku}: {last_error}", flush=True)
        continue

    w, h = image.size
    # The caption/color-chip band occupies the bottom ~14% of the frontal plate.
    # Exclude that band before fitting the original bag image to the canvas.
    photo = image.crop((0, 0, w, round(h * 0.85)))
    canvas = Image.new("RGB", (1000, 1000), "#ffffff")
    fitted = ImageOps.contain(photo, (920, 920), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((1000 - fitted.width) // 2, (1000 - fitted.height) // 2))
    canvas.save(target, "WEBP", quality=84, method=5)
    ok.append(sku)
    if n % 20 == 0:
        print(f"Completed {n}/{len(catalog)}", flush=True)

# Normalize near-white neutral photographic and canvas backgrounds to pure white.
# Only neutral highlights are affected: colored leather, stitching and hardware stay intact.
from PIL import ImageChops

for target in sorted(out.glob("M??-??.webp")):
    image = Image.open(target).convert("RGB")
    red, green, blue = image.split()
    white_r = red.point(lambda v: 255 if v >= 240 else 0)
    white_g = green.point(lambda v: 255 if v >= 237 else 0)
    white_b = blue.point(lambda v: 255 if v >= 232 else 0)
    neutral = ImageChops.subtract(red, blue).point(lambda v: 255 if v <= 19 else 0)
    mask = ImageChops.multiply(ImageChops.multiply(white_r, white_g), ImageChops.multiply(white_b, neutral))
    image.paste((255, 255, 255), (0, 0, image.width, image.height), mask)
    image.save(target, "WEBP", quality=91, method=5)

report = {"total":len(catalog),"generated":len(ok),"failed":errors}
(out / "manifest.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False), flush=True)
if errors:
    sys.exit(f"Unconverted images: {len(errors)}")
