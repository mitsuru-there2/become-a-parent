import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from kosodate.engine import ROOT


class InteractiveTests(unittest.TestCase):
    def test_full_japanese_play_then_finished_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "family.sqlite")
            inputs = []
            for turn in range(1, 41):
                inputs.extend(["1", "n"])
                if turn in {1, 5, 7, 13, 19, 25, 31, 37, 40}: inputs.append("1")
            p = subprocess.run([sys.executable, "-m", "kosodate", "play", "--run", path], cwd=ROOT,
                               input="\n".join(inputs) + "\n", capture_output=True, text=True, timeout=45)
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertIn("結末 EN-", p.stdout)
            self.assertIn("親Aの最期", p.stdout)
            self.assertNotIn("INTERNAL_ERROR", p.stdout)
            result = subprocess.run([sys.executable, "-m", "kosodate", "result", "--run", path], cwd=ROOT,
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(json.loads(result.stdout)["phase"], "finished")
            resume = subprocess.run([sys.executable, "-m", "kosodate", "play", "--run", path], cwd=ROOT,
                                    input="", capture_output=True, text=True, timeout=15)
            self.assertIn("結末 EN-", resume.stdout)

    def test_quit_at_event_and_resume_keeps_draft(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "family.sqlite")
            command = [sys.executable, "-m", "kosodate", "play", "--run", path]
            first = subprocess.run(command, cwd=ROOT, input="4\nn\nq\n", capture_output=True, text=True, timeout=15)
            self.assertEqual(first.returncode, 0)
            resume = subprocess.run(command, cwd=ROOT, input="n\n1\nq\n", capture_output=True, text=True, timeout=15)
            self.assertIn("第2/40期", resume.stdout)
            self.assertIn("自分=2", resume.stdout)

    def test_stream_recovers_from_bad_request(self):
        p = subprocess.run([sys.executable, "-m", "kosodate", "serve"], cwd=ROOT,
                           input='{"command":4}\n{"command":"scenarios"}\n', capture_output=True, text=True, timeout=15)
        replies = [json.loads(line) for line in p.stdout.splitlines()]
        self.assertEqual([r["exit_code"] for r in replies], [2, 0])
        self.assertEqual(p.returncode, 0)


if __name__ == "__main__": unittest.main()
