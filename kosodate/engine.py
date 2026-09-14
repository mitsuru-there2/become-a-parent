"""Private Godot bridge. No game calculations live in Python."""
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent


def godot_path():
    candidates = [os.environ.get("GODOT_BIN"), shutil.which("godot"), shutil.which("godot4"),
                  ROOT / ".tools/Godot.app/Contents/MacOS/Godot",
                  "/Applications/Godot.app/Contents/MacOS/Godot"]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(candidate)
    raise RuntimeError("Godotが見つかりません。READMEの手順で導入するかGODOT_BINを指定してください。")


class Engine:
    def __init__(self):
        self.errors = tempfile.TemporaryFile(mode="w+")
        self.runtime = tempfile.TemporaryDirectory(prefix="kosodate-engine-")
        self.process = subprocess.Popen(
            [godot_path(), "--headless", "--no-header", "--path", str(ROOT),
             "--log-file", str(Path(self.runtime.name) / "godot.log"), "--script", "res://game/bridge.gd"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.errors,
            bufsize=-1)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)

    def call(self, op, **args):
        data = json.dumps(dict(op=op, **args), ensure_ascii=False).encode("utf-8")
        self.process.stdin.write(("%012d" % len(data)).encode("ascii") + data)
        self.process.stdin.flush()
        if not self.selector.select(timeout=30):
            self.process.kill()
            raise RuntimeError("Godotの応答がタイムアウトしました。")
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("Godotが正常な応答を返さず終了しました。")
        try:
            result = json.loads(line)
        except ValueError as exc:
            raise RuntimeError("Godotの応答形式が不正です。") from exc
        if "error" in result:
            raise RuntimeError("Godot内部プロトコルのエラーです。")
        self.errors.flush()
        self.errors.seek(0)
        if "SCRIPT ERROR" in self.errors.read():
            raise RuntimeError("Godotスクリプトの実行が失敗しました。")
        return result

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write(b'000000000013{"op":"quit"}')
                self.process.stdin.flush()
                self.process.wait(timeout=3)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.process.kill()
                self.process.wait()
        self.selector.close()
        self.process.stdin.close()
        self.process.stdout.close()
        self.errors.close()
        self.runtime.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
