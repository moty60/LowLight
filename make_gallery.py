import argparse
import json
import re
import shutil
import secrets
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or "client"


def ensure_pillow():
    if Image is None:
        raise SystemExit(
            "Pillow not installed. Run: python -m pip install pillow\n"
            "Or run this script with --no-thumbs"
        )


def list_images(src: Path):
    exts = {".jpg", ".jpeg", ".png", ".webp"}
    files = [p for p in src.iterdir() if p.is_file() and p.suffix.lower() in exts]
    files.sort()
    return files


def copy_template(template_dir: Path, out_dir: Path):
    if out_dir.exists():
        raise SystemExit(f"Output already exists: {out_dir}")
    shutil.copytree(template_dir, out_dir)


def make_thumbs(images, thumbs_dir: Path, max_size=1400, quality=82):
    ensure_pillow()
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    for img_path in images:
        # thumbnails match the full image name (001.jpg, 002.jpg, ...)
        out_path = (thumbs_dir / img_path.stem).with_suffix(".jpg")

        with Image.open(img_path) as im:
            im = im.convert("RGB")
            im.thumbnail((max_size, max_size))
            im.save(out_path, format="JPEG", quality=quality, optimize=True, progressive=True)


def main():
    parser = argparse.ArgumentParser(description="Create a Lowlight Studio client gallery")
    parser.add_argument("client_name", help="Client name (used in slug + title)")
    parser.add_argument("source_folder", help="Folder containing final images (JPEG/PNG/WebP)")
    parser.add_argument("--template", default="c/template", help="Template folder path")
    parser.add_argument("--outroot", default="c", help="Root folder where galleries live")
    parser.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"), help="Date string")
    parser.add_argument("--no-thumbs", action="store_true", help="Skip generating thumbnails")
    parser.add_argument("--thumb-size", type=int, default=1400, help="Thumbnail max dimension")
    parser.add_argument("--thumb-quality", type=int, default=82, help="Thumbnail JPEG quality")
    parser.add_argument("--token", default=None, help="Optional token (else random)")
    args = parser.parse_args()

    template_dir = Path(args.template)
    outroot = Path(args.outroot)
    src = Path(args.source_folder)

    if not template_dir.exists():
        raise SystemExit(f"Template not found: {template_dir}")
    if not src.exists():
        raise SystemExit(f"Source folder not found: {src}")

    # URL format: clientname-date-token (you asked for this)
    token = args.token or secrets.token_hex(3)  # 6 hex chars
    slug = f"{slugify(args.client_name)}-{args.date}-{token}"
    out_dir = outroot / slug

    # Copy template into new client folder
    copy_template(template_dir, out_dir)

    full_dir = out_dir / "full"
    thumbs_dir = out_dir / "thumbs"
    full_dir.mkdir(parents=True, exist_ok=True)
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    imgs = list_images(src)
    if not imgs:
        raise SystemExit("No images found in source folder.")

    # Copy images into full/ with clean sequential names (001.jpg ...)
    copied = []
    for i, p in enumerate(imgs, start=1):
        name = f"{i:03d}.jpg"
        dest = full_dir / name
        shutil.copy2(p, dest)
        copied.append(dest)

    # Generate thumbnails (optional)
    if not args.no_thumbs:
        make_thumbs(copied, thumbs_dir, max_size=args.thumb_size, quality=args.thumb_quality)

    # Build manifest.json for your gallery page
    manifest = {
        "title": f"{args.client_name} — Gallery",
        "subtitle": f"Delivered {args.date} · Lowlight Studio",
        "note": "These are your final edits. Please avoid heavy filters that significantly change the delivered look.",
        "zipName": f"{slugify(args.client_name)}-lowlight.zip",
        "openFolder": "./full/",
        "images": []
    }

    for p in copied:
        item = {
            "url": f"./full/{p.name}",
            "filename": p.name
        }

        thumb_candidate = (thumbs_dir / p.stem).with_suffix(".jpg")
        if thumb_candidate.exists():
            item["thumb"] = f"./thumbs/{thumb_candidate.name}"

        manifest["images"].append(item)

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("✅ Gallery created:")
    print(f"   Folder: {out_dir.as_posix()}")
    print(f"   URL:    /c/{slug}/")
    print("Next: Commit + Push in GitHub Desktop")


if __name__ == "__main__":
    main()
