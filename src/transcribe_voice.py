#!/usr/bin/env python3
"""
Offline voice transcription using Whisper local model.

Usage: python transcribe_voice.py <audio_file_path>
Output: JSON with transcript or error (stdout only, no debug prints)
"""
import sys
import json


def transcribe(audio_path):
    try:
        import whisper
        model = whisper.load_model("small")
        result = model.transcribe(audio_path, language="it", fp16=False)
        return {"success": True, "text": result["text"].strip()}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No audio file provided"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    result = transcribe(audio_path)
    print(json.dumps(result))
