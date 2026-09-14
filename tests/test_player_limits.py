import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from scripts.public_player import PublicPlayer


class PlayerLimitsTests(unittest.TestCase):
    def test_limit_and_external_interruption_are_not_bad_endings(self):
        for max_calls, expected in ((0, "operation_limit"), (600, "external_interruption")):
            with tempfile.TemporaryDirectory() as tmp:
                process = SimpleNamespace(stdin=io.StringIO(), stdout=io.StringIO())
                result = PublicPlayer(process, Path(tmp), "BP-01", 0, max_calls=max_calls).run()
                self.assertEqual(result["status"], expected)
                self.assertIsNone(result["result"])
                self.assertEqual(result["advances"], 0)
