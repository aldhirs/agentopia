# Promo video

30-second Agentopia promo, rendered from the real 3D office (`src/film.ts`).

1. Voice-over (one clip per scene, Microsoft Edge neural voice "Ava"; sends the lines to Microsoft):
   ```sh
   python3 -m venv .venv && .venv/bin/pip install edge-tts numpy
   i=1; while IFS= read -r line; do .venv/bin/edge-tts --voice en-US-AvaNeural --rate=+12% --pitch=+6Hz \
     --text "$line" --write-media vo/l$i.mp3; i=$((i+1)); done < scripts/video/voiceover.txt
   ```
2. Music and sound effects, synthesised (no samples, free to use): `.venv/bin/python scripts/video/music.py`
   → `music.wav`, `sfx.wav`. Scene times match `SCENES` in `src/film.ts`.
3. Mix: voice cues at 0.5, 3.3, 8.5, 12.7, 17.8, 22.45, 27.15 s; music ducked under the voice
   (ffmpeg `sidechaincompress`), loudness normalised to −16 LUFS → `mix.wav`.
4. Frames at 3840×2160 and encode (4K + supersampled 1080p):
   `npm run build && npx electron scripts/make-video.cjs <outDir> mix.wav`
