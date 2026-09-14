"""Targeted legal CLI paths; internal coverage study, not blind play."""
import json
from pathlib import Path
import subprocess
import sys

from public_player import PublicPlayer


class EndingPlayer(PublicPlayer):
    def __init__(self, *args, variant, **kwargs):
        super().__init__(*args, **kwargs)
        self.variant = variant

    def select_plan(self, public):
        plan, goal = super().select_plan(public)
        if self.variant == "quiet":
            for p in ("A", "B"): plan["parents"][p]["bond"] = 0
        elif self.variant == "distance":
            for p in ("A", "B"): plan["parents"][p]["self"] = 0
        return plan, goal


def main():
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=False)
    root = Path(__file__).resolve().parent.parent
    process = subprocess.Popen([sys.executable, "-m", "kosodate", "serve"], cwd=root,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
    cases = [("EN-01", "BP-02", 0, "quiet"), ("EN-02", "BP-03", 0, "standard"),
             ("EN-03", "BP-04", 0, "standard"), ("EN-04", "BP-01", 1, "distance"),
             ("EN-05", "BP-02", 0, "standard")]
    results = []
    try:
        for expected, pattern, seed, variant in cases:
            directory = output / expected; directory.mkdir()
            result = EndingPlayer(process, directory, pattern, seed, variant=variant).run()
            result.update(kind="targeted_ending_coverage_not_blind_play", expected_ending=expected, variant=variant)
            assert result["status"] == "completed", result
            actual = result["result"]["ending"]["id"]
            print(expected, actual, result["result"]["ending"]["title"], flush=True)
            assert actual == expected, (expected, actual)
            results.append(result)
    finally:
        process.stdin.close(); process.wait(timeout=10); process.stdout.close()
    (output / "summary.json").write_text(json.dumps(dict(kind="targeted_ending_coverage", results=results), ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__": main()
