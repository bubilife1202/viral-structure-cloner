from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig
from urllib.parse import urlparse, parse_qs
import sys
import glob
import os
import tempfile
import time

from yt_dlp import YoutubeDL

# Whisper model (lazy loaded)
_whisper_model = None

def get_whisper_model():
    """Lazy load the Whisper model to avoid slow startup"""
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            print("Loading Whisper model (small)...")
            start = time.time()
            # Use small model for better accuracy, CPU mode
            _whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
            print(f"Whisper model loaded in {time.time() - start:.1f}s")
        except Exception as e:
            print(f"Failed to load Whisper model: {e}")
            return None
    return _whisper_model


def transcribe_with_whisper(video_id: str, url: str) -> dict | None:
    """
    Download audio and transcribe with Whisper.
    Returns { "text": "...", "duration": seconds } or None
    """
    try:
        print(f"Attempting Whisper transcription for {video_id}...")
        start_time = time.time()

        model = get_whisper_model()
        if model is None:
            return None

        # Create temp directory for audio
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, f"{video_id}")

            # Download audio only (without ffmpeg conversion)
            ydl_opts = {
                "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
                "outtmpl": audio_path + ".%(ext)s",
                "quiet": True,
                "no_warnings": True,
            }

            print("Downloading audio...")
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # Find the downloaded audio file
            audio_files = glob.glob(os.path.join(tmpdir, f"{video_id}.*"))
            if not audio_files:
                print("No audio file downloaded")
                return None

            audio_file = audio_files[0]
            print(f"Audio downloaded: {audio_file}")

            # Transcribe with Whisper - use beam_size=5 for better accuracy, try Korean first
            print("Transcribing with Whisper (Korean)...")
            segments, info = model.transcribe(audio_file, beam_size=5, language="ko")

            # Collect all segments
            text_parts = []
            duration = 0.0
            for segment in segments:
                text_parts.append(segment.text.strip())
                duration = max(duration, segment.end)

            full_text = " ".join(text_parts).strip()
            elapsed = time.time() - start_time

            print(f"Whisper transcription complete in {elapsed:.1f}s")
            print(f"Detected language: {info.language}, Duration: {duration:.1f}s")
            print(f"Transcript preview: {full_text[:100]}...")

            if full_text:
                return {"text": full_text, "duration": duration}

        return None

    except Exception as e:
        print(f"Whisper transcription failed: {e}")
        import traceback
        traceback.print_exc()
        return None

def get_transcript(url):
    """
    Extracts video ID from URL and fetches transcript.
    Returns a dict: { "text": "...", "duration": seconds or None } or None if failed.
    """
    try:
        video_id = None
        parsed_url = urlparse(url)

        if parsed_url.hostname == 'youtu.be':
            video_id = parsed_url.path[1:]
        if parsed_url.hostname in ('www.youtube.com', 'youtube.com'):
            if parsed_url.path == '/watch':
                p = parse_qs(parsed_url.query)
                video_id = p['v'][0]
            if parsed_url.path[:7] == '/embed/':
                video_id = parsed_url.path.split('/')[2]
            if parsed_url.path[:3] == '/v/':
                video_id = parsed_url.path.split('/')[2]
            if parsed_url.path[:8] == '/shorts/':
                video_id = parsed_url.path.split('/')[2]

        if not video_id:
            print(f"Failed to extract video_id from: {url}")
            return None

        print(f"Extracted video_id: {video_id} from {url}")

        # Method 1: youtube_transcript_api
        try:
            api = YouTubeTranscriptApi()
            transcript_items = None

            # Try 1: Get list of available transcripts and fetch any available one
            try:
                transcript_list = api.list(video_id)
                print(f"Available transcripts: {[t.language_code for t in transcript_list]}")

                # Priority order for languages
                preferred_langs = ['ko', 'en', 'ja', 'zh-Hans', 'zh-Hant', 'es', 'pt', 'de', 'fr']

                # Try to find a transcript in preferred language order
                for lang in preferred_langs:
                    for transcript in transcript_list:
                        if transcript.language_code == lang or transcript.language_code.startswith(lang):
                            print(f"Found transcript in {transcript.language_code}")
                            transcript_items = transcript.fetch()
                            break
                    if transcript_items:
                        break

                # If no preferred language found, get the first available
                if not transcript_items:
                    for transcript in transcript_list:
                        print(f"Using first available transcript: {transcript.language_code}")
                        transcript_items = transcript.fetch()
                        break

            except Exception as list_error:
                print(f"api.list failed: {list_error}")
                # Try 2: Direct fetch with expanded language list
                try:
                    preferred_langs = ['ko', 'en', 'en-US', 'ja', 'zh', 'zh-Hans', 'zh-Hant', 'es', 'pt', 'de', 'fr']
                    transcript_items = api.fetch(video_id, languages=preferred_langs)
                except Exception as fetch_error:
                    print(f"api.fetch with languages failed: {fetch_error}")
                    # Try 3: Fetch without specifying languages
                    transcript_items = api.fetch(video_id)

            if transcript_items:
                # Convert to list if needed
                if hasattr(transcript_items, '__iter__'):
                    transcript_items = list(transcript_items)

                full_text = " ".join(item.text for item in transcript_items).strip()
                duration = 0.0
                if transcript_items:
                    last = transcript_items[-1]
                    duration = float(getattr(last, 'start', 0) + getattr(last, 'duration', 0))

                if full_text:
                    return {"text": full_text, "duration": duration or None}

            # youtube_transcript_api didn't return usable transcript, fall through to Whisper
            print("youtube_transcript_api returned no usable transcript, trying Whisper...")
            result = transcribe_with_whisper(video_id, url)
            if result:
                return result
            return None

        except Exception as e:
            print(f"youtube_transcript_api failed: {e}")

            # Method 2: yt-dlp fallback (library call)
            try:
                print("Attempting yt-dlp fallback...")
                output_template = f"transcript_{video_id}.%(ext)s"

                # Clean up old files
                for f in glob.glob(f"transcript_{video_id}*"):
                    os.remove(f)

                ydl_opts = {
                    "skip_download": True,
                    "writesubtitles": True,
                    "writeautomaticsub": True,
                    "subtitleslangs": ["ko", "en", "ja", "zh", "es", "pt", "de", "fr"],
                    "outtmpl": output_template,
                    "quiet": True,
                }

                with YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])

                # Find the downloaded vtt file
                files = glob.glob(f"transcript_{video_id}*.vtt")
                if not files:
                    print("No subtitle files found, trying Whisper...")
                    # No subtitles found, try Whisper fallback
                    result = transcribe_with_whisper(video_id, url)
                    if result:
                        return result
                    return None

                vtt_file = files[0]

                # Simple VTT parser (skipping timestamps) - duration unavailable here
                text_content = []
                with open(vtt_file, 'r', encoding='utf-8') as f:
                    seen_lines = set()
                    for line in f:
                        line = line.strip()
                        if '-->' in line or not line or line == 'WEBVTT':
                            continue
                        if line not in seen_lines:
                            text_content.append(line)
                            seen_lines.add(line)

                # Cleanup
                for f_path in glob.glob(f"transcript_{video_id}*"):
                    os.remove(f_path)

                return {"text": " ".join(text_content), "duration": None}

            except Exception as e2:
                print(f"yt-dlp fallback failed: {e2}")

                # Method 3: Whisper fallback (for videos without subtitles)
                result = transcribe_with_whisper(video_id, url)
                if result:
                    return result

                return None

    except Exception as e:
        print(f"Error fetching transcript: {e}")
        return None
