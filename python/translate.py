#!/usr/bin/env python3
"""
Argos Translate Integration for Docfai
Provides offline EN<->DE translation using bundled models
"""

import sys
import json
import os
from pathlib import Path

try:
    import argostranslate.package
    import argostranslate.translate
except ImportError:
    print(json.dumps({"error": "argostranslate not installed. Run: pip install argostranslate"}))
    sys.exit(1)

def get_installed_languages():
    """Get list of installed language packages"""
    return argostranslate.translate.get_installed_languages()

def ensure_languages_installed():
    """Ensure EN<->DE language packages are installed"""
    installed = get_installed_languages()

    has_en = any(lang.code == "en" for lang in installed)
    has_de = any(lang.code == "de" for lang in installed)

    if has_en and has_de:
        return True

    # Try to install from bundled models
    script_dir = Path(__file__).parent
    models_dir = script_dir / "models"

    if models_dir.exists():
        for model_file in models_dir.glob("*.argosmodel"):
            try:
                argostranslate.package.install_from_path(str(model_file))
            except Exception as e:
                print(json.dumps({"error": f"Failed to install {model_file.name}: {str(e)}"}), file=sys.stderr)

    # Refresh and check again
    installed = get_installed_languages()
    has_en = any(lang.code == "en" for lang in installed)
    has_de = any(lang.code == "de" for lang in installed)

    return has_en and has_de

def translate_text(text, from_lang, to_lang):
    """Translate text from source to target language"""
    if not text or not text.strip():
        return text

    if from_lang == to_lang:
        return text

    # Ensure languages are installed
    if not ensure_languages_installed():
        raise Exception("Language packages not available")

    installed = get_installed_languages()

    # Get language objects
    from_language = next((lang for lang in installed if lang.code == from_lang), None)
    to_language = next((lang for lang in installed if lang.code == to_lang), None)

    if not from_language or not to_language:
        raise Exception(f"Language pair {from_lang}->{to_lang} not available")

    # Perform translation
    translation = from_language.get_translation(to_language)
    return translation.translate(text)

def detect_language(text):
    """Simple language detection based on common words"""
    text_lower = text.lower()

    # German indicators
    german_chars = ['ä', 'ö', 'ü', 'ß']
    german_words = ['der', 'die', 'das', 'und', 'ein', 'eine', 'ist', 'sind', 'mit', 'von']

    has_german_chars = any(char in text for char in german_chars)
    has_german_words = any(f' {word} ' in f' {text_lower} ' for word in german_words)

    if has_german_chars or has_german_words:
        return 'de'

    return 'en'

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: translate.py <command> <args>"}))
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == "translate":
            # Single text translation
            # Args: text, targetLang, [sourceLang]
            if len(sys.argv) < 4:
                print(json.dumps({"error": "Missing arguments for translate"}))
                sys.exit(1)

            text = sys.argv[2]
            target_lang = sys.argv[3]
            source_lang = sys.argv[4] if len(sys.argv) > 4 else detect_language(text)

            translated = translate_text(text, source_lang, target_lang)
            result = {
                "translatedText": translated,
                "detectedSourceLang": source_lang
            }
            print(json.dumps(result))

        elif command == "translate_batch":
            # Batch translation
            # Args: JSON array of texts, targetLang, [sourceLang]
            if len(sys.argv) < 4:
                print(json.dumps({"error": "Missing arguments for translate_batch"}))
                sys.exit(1)

            texts = json.loads(sys.argv[2])
            target_lang = sys.argv[3]
            source_lang = sys.argv[4] if len(sys.argv) > 4 else None

            translated_texts = []
            for text in texts:
                lang = source_lang or detect_language(text)
                translated = translate_text(text, lang, target_lang)
                translated_texts.append(translated)

            result = {"translatedTexts": translated_texts}
            print(json.dumps(result))

        else:
            print(json.dumps({"error": f"Unknown command: {command}"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
