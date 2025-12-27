#!/usr/bin/env python3
"""
Generate Inno Setup installer images from a single logo.

Usage:
    python generate_installer_images.py <logo_path>

Example:
    python generate_installer_images.py ../../resources/win32/roopik-logo.png
"""

import sys
import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("ERROR: Pillow library not found!")
    print("Install it with: pip install Pillow")
    sys.exit(1)


def create_big_image(logo_path: str, dpi_scale: float, output_path: str, bg_color: str = "#2D2D30"):
    """
    Create the big sidebar image (164x314 at 100% DPI).

    Args:
        logo_path: Path to the source logo
        dpi_scale: DPI scaling factor (1.0 = 100%, 1.25 = 125%, etc.)
        output_path: Where to save the BMP
        bg_color: Background color (hex)
    """
    # Base dimensions at 100% DPI
    base_width = 164
    base_height = 314

    # Scale for DPI
    width = int(base_width * dpi_scale)
    height = int(base_height * dpi_scale)

    # Create background
    img = Image.new('RGB', (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Load and resize logo
    logo = Image.open(logo_path)

    # Convert to RGBA if needed
    if logo.mode != 'RGBA':
        logo = logo.convert('RGBA')

    # Calculate logo size (60% of width, maintain aspect ratio)
    logo_width = int(width * 0.6)
    aspect_ratio = logo.height / logo.width
    logo_height = int(logo_width * aspect_ratio)

    # Resize logo
    logo_resized = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)

    # Center logo vertically, slightly offset horizontally
    x = (width - logo_width) // 2
    y = (height - logo_height) // 2 - int(height * 0.1)  # Slightly above center

    # Paste logo (handle transparency)
    if logo_resized.mode == 'RGBA':
        img.paste(logo_resized, (x, y), logo_resized)
    else:
        img.paste(logo_resized, (x, y))

    # Save as BMP
    img.save(output_path, 'BMP')
    print(f"✓ Created: {output_path} ({width}×{height})")


def create_small_image(logo_path: str, dpi_scale: float, output_path: str, bg_color: str = "#2D2D30"):
    """
    Create the small header image (55x58 at 100% DPI).

    Args:
        logo_path: Path to the source logo
        dpi_scale: DPI scaling factor
        output_path: Where to save the BMP
        bg_color: Background color (hex)
    """
    # Base dimensions at 100% DPI
    base_width = 55
    base_height = 58

    # Scale for DPI
    width = int(base_width * dpi_scale)
    height = int(base_height * dpi_scale)

    # Create background
    img = Image.new('RGB', (width, height), bg_color)

    # Load and resize logo
    logo = Image.open(logo_path)

    # Convert to RGBA if needed
    if logo.mode != 'RGBA':
        logo = logo.convert('RGBA')

    # Calculate logo size (80% of dimensions, maintain aspect ratio)
    logo_size = int(min(width, height) * 0.8)
    aspect_ratio = logo.height / logo.width

    if aspect_ratio > 1:  # Taller than wide
        logo_height = logo_size
        logo_width = int(logo_size / aspect_ratio)
    else:  # Wider than tall
        logo_width = logo_size
        logo_height = int(logo_size * aspect_ratio)

    # Resize logo
    logo_resized = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)

    # Center logo
    x = (width - logo_width) // 2
    y = (height - logo_height) // 2

    # Paste logo (handle transparency)
    if logo_resized.mode == 'RGBA':
        img.paste(logo_resized, (x, y), logo_resized)
    else:
        img.paste(logo_resized, (x, y))

    # Save as BMP
    img.save(output_path, 'BMP')
    print(f"✓ Created: {output_path} ({width}×{height})")


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_installer_images.py <logo_path>")
        print("Example: python generate_installer_images.py ../../resources/win32/roopik-logo.png")
        sys.exit(1)

    logo_path = sys.argv[1]

    if not os.path.exists(logo_path):
        print(f"ERROR: Logo file not found: {logo_path}")
        sys.exit(1)

    # Output directory
    script_dir = Path(__file__).parent
    output_dir = script_dir.parent.parent / "resources" / "win32"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"📸 Generating installer images from: {logo_path}")
    print(f"📁 Output directory: {output_dir}")
    print()

    # DPI scales to generate
    dpi_scales = {
        100: 1.0,
        125: 1.25,
        150: 1.5,
        175: 1.75,
        200: 2.0,
        225: 2.25,
        250: 2.5,
    }

    # Background color (VS Code dark theme)
    bg_color = "#2D2D30"

    # Generate big images
    print("🖼️  Generating big images (sidebar)...")
    for dpi, scale in dpi_scales.items():
        output_path = output_dir / f"inno-big-{dpi}.bmp"
        create_big_image(logo_path, scale, str(output_path), bg_color)

    print()

    # Generate small images
    print("🖼️  Generating small images (header)...")
    for dpi, scale in dpi_scales.items():
        output_path = output_dir / f"inno-small-{dpi}.bmp"
        create_small_image(logo_path, scale, str(output_path), bg_color)

    print()
    print("✅ All installer images generated successfully!")
    print(f"📁 Files saved to: {output_dir}")


if __name__ == "__main__":
    main()
