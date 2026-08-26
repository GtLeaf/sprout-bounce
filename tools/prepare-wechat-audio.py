from __future__ import annotations

import audioop
import sys
import wave
from pathlib import Path


def convert(source: Path, destination: Path, target_rate: int) -> None:
    with wave.open(str(source), "rb") as reader:
        channels = reader.getnchannels()
        width = reader.getsampwidth()
        rate = reader.getframerate()
        frames = reader.readframes(reader.getnframes())

    if width != 2:
        raise ValueError(f"Expected 16-bit PCM: {source}")
    if channels == 2:
        frames = audioop.tomono(frames, width, 0.5, 0.5)
        channels = 1
    if rate != target_rate:
        frames, _ = audioop.ratecv(frames, width, channels, rate, target_rate, None)

    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as writer:
        writer.setnchannels(channels)
        writer.setsampwidth(width)
        writer.setframerate(target_rate)
        writer.writeframes(frames)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: prepare-wechat-audio.py <repo-root> <mini-game-root>")
    source_root = Path(sys.argv[1])
    target_root = Path(sys.argv[2])
    files = {
        "mix-v91/happyjump-bgm-bouncy-party-v91.wav": 22050,
        "mix-v91/happyjump-full-clear-party-v91.wav": 24000,
        "mix-v91/happyjump-game-over-party-v91.wav": 24000,
        "mix-v91/happyjump-level-clear-party-v91.wav": 24000,
        "mix-v91/happyjump-life-lost-party-v91.wav": 24000,
        "mix-v91/happyjump-timeout-party-v91.wav": 24000,
        "mix-v92/happyjump-hop-soft-pop-v92.wav": 24000,
    }
    for relative, rate in files.items():
        convert(source_root / "assets" / "audio" / relative, target_root / "assets" / "audio" / relative, rate)


if __name__ == "__main__":
    main()
