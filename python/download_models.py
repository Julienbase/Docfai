#!/usr/bin/env python3
"""
Download Argos Translate EN<->DE models for bundling with the app
Run this once during build process
"""

import argostranslate.package
from pathlib import Path
import shutil
import sys

def download_models():
    """Download EN<->DE language models"""

    # Create models directory
    script_dir = Path(__file__).parent
    models_dir = script_dir / "models"
    models_dir.mkdir(exist_ok=True)

    print("Downloading Argos Translate language models...")
    print(f"Models directory: {models_dir}")

    # Update package index
    print("\nUpdating package index...")
    argostranslate.package.update_package_index()
    available_packages = argostranslate.package.get_available_packages()

    # Download EN->DE
    print("\nDownloading English -> German model...")
    en_to_de = next(
        (pkg for pkg in available_packages if pkg.from_code == "en" and pkg.to_code == "de"),
        None
    )

    if en_to_de:
        model_path = en_to_de.download()
        dest = models_dir / "translate-en_de.argosmodel"
        shutil.copy(model_path, dest)
        print(f"Saved: {dest}")
        print(f"Size: {dest.stat().st_size / (1024*1024):.1f} MB")
    else:
        print("ERROR: English -> German model not found")
        return False

    # Download DE->EN
    print("\nDownloading German -> English model...")
    de_to_en = next(
        (pkg for pkg in available_packages if pkg.from_code == "de" and pkg.to_code == "en"),
        None
    )

    if de_to_en:
        model_path = de_to_en.download()
        dest = models_dir / "translate-de_en.argosmodel"
        shutil.copy(model_path, dest)
        print(f"Saved: {dest}")
        print(f"Size: {dest.stat().st_size / (1024*1024):.1f} MB")
    else:
        print("ERROR: German -> English model not found")
        return False

    # Summary
    total_size = sum(f.stat().st_size for f in models_dir.glob("*.argosmodel"))
    print(f"\nModels downloaded successfully!")
    print(f"Total size: {total_size / (1024*1024):.1f} MB")
    print(f"Location: {models_dir}")

    return True

if __name__ == "__main__":
    try:
        success = download_models()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
