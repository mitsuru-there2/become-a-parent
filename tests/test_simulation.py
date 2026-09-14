"""Internal verification: kept separate from public-only play records."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

from kosodate.engine import Engine, ROOT


def convert_plan(p):
    return {"parents": dict(zip(("A", "B"), p["parents"])), "activity": {"domain": p["domain"], "level": p["level"], "sponsor": "AB"[p["sponsor"]]}, "style": ["respect", "coach", "push"][p["q"]], "help": p["help"]}


class SimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.engine = Engine()

    @classmethod
    def tearDownClass(cls): cls.engine.close()

    def new(self): return self.engine.call("new", scenario="home-01", seed=0)["state"]

    def observe(self, state): return self.engine.call("observe", state=state)["view"]

    def advance(self, state, value=99):
        for e in self.observe(state)["choices"]:
            state["answers"].setdefault(e["instance_id"], e["options"][0]["option_id"])
        return self.engine.call("fixture-advance", state=state, draw=value)["state"]

    def test_reference_all_200_turns_and_adult_results(self):
        reference = json.loads((ROOT / "docs/specs/calculated-traces.json").read_text())
        names = {"S": "stress", "H": "health", "F": "fulfillment", "N": "social", "G": "regret"}
        for run in reference["runs"]:
            s = self.engine.call("new", scenario="home-02" if run["pattern"] == "BP-05" else "home-01", seed=0)["state"]
            for turn in run["turns"]:
                s["plan"] = convert_plan(turn["plan"])
                s["answers"] = {"t%02d:%s" % (turn["turn"], e): e + ":" + o for e, o in turn["answers"]}
                self.assertTrue(self.observe(s)["public"]["forecast"]["can_advance"], (run["pattern"], turn["turn"]))
                s = self.engine.call("advance", state=s)["state"]
                numeric = s["effects"][-1]["after"]
                expected = turn["state"]
                context = (run["pattern"], turn["turn"])
                self.assertEqual(numeric["cash"], expected["M"], context)
                self.assertEqual(numeric["couple"], expected["K"], context)
                for key, internal in (("stress", "X"), ("autonomy", "U"), ("adaptation", "V")):
                    self.assertEqual(numeric["child"][key], expected[internal], (context, key))
                for key, internal in (("interest", "I"), ("ability", "B")):
                    self.assertEqual([numeric["child"][key][d] for d in ("study", "craft")], expected[internal], (context, key))
                for i, p in enumerate(("A", "B")):
                    for short, name in names.items(): self.assertEqual(numeric["parents"][p][name], expected["P"][i][short], (context, p, name))
                    self.assertEqual(numeric["child"]["trust"][p], expected["P"][i]["T"], context)
                for short, name in (("GH", "health"), ("GR", "relation"), ("GM", "funds")):
                    self.assertEqual(numeric["grandparents"][name], expected[short], context)
                raw = "rules-1|data-1|0|child|%d|oddity" % turn["turn"]
                actual_draw = next(d["value"] for d in s["draws"] if d["phase"] == "child" and d["index"] == turn["turn"])
                self.assertEqual(actual_draw, int.from_bytes(hashlib.sha256(raw.encode()).digest()[:8], "big") % 100)
            self.assertEqual(s["n"], 40)
            self.assertEqual(s["phase"], "finished")
            self.assertEqual(s["queue"], [])
            for i, p in enumerate(("A", "B")):
                got, exp = s["result"]["parents"][p], run["result"]["parents"][i]
                for key in ("happiness", "cash", "health"): self.assertEqual(got[key], exp[key], (run["pattern"], p, key))
                self.assertEqual(got["death_age"], exp["age"])
            for key in ("domain", "route", "residence", "happiness", "autonomy"):
                self.assertEqual(s["result"]["child"][key], run["result"]["child"][key])
            self.assertEqual(s["result"]["child"]["social_success"], run["result"]["child"]["success"])
            self.assertEqual([h["adult_step"] for h in s["history"] if h["kind"] == "adult"], list(range(1, len(run["adult"])+1)))
            for h in s["history"]:
                for m in h["money"]: self.assertEqual(m["before"] + m["income"] - m["expense"] - m["cap_overflow"], m["after"])

    def test_first_turn_fixture(self):
        s = self.advance(self.new())
        self.assertEqual(s["cash"], 160)
        self.assertEqual(s["couple"], 61)
        self.assertEqual(s["parents"]["A"], dict(age_months=366, stress=28, health=81, fulfillment=49, social=48, regret=9))
        self.assertEqual(s["child"]["stress"], 15)
        self.assertEqual(s["child"]["trust"], dict(A=61, B=61))

    def test_observation_boundaries_and_no_hidden_keys(self):
        for value, expected in ((39, "余裕がありそう"), (40, "少し疲れている様子"), (69, "少し疲れている様子"), (70, "休みたがることが増えた")):
            s = self.new(); s["child"]["stress"] = value
            view = self.engine.call("fixture-open", state=s)["view"]
            self.assertEqual(view["public"]["observations"][0]["text"], expected)
            encoded = json.dumps(view)
            for key in ('"aptitude"', '"adaptation"', '"trust"', '"ability"', '"seed"', '"draws"', '"target"'):
                self.assertNotIn(key, encoded)
        for value, expected in ((29, "話しかけても会話が続きにくい"), (30, "用事や近況を話す"), (59, "用事や近況を話す"), (60, "自分から話をしに来る")):
            s = self.new(); s["n"] = 12; s["child"]["trust"]["A"] = value
            view = self.engine.call("fixture-open", state=s)["view"]
            self.assertEqual(next(o["text"] for o in view["public"]["observations"] if o["code"] == "relationship.A"), expected)
        s = self.new(); s["deltas"] = [2, 3]
        view = self.engine.call("fixture-open", state=s)["view"]
        self.assertIn("trend: strain_rising", [o["code"] for o in view["public"]["observations"]])
        s["previous_plan"]["parents"]["A"]["bond"] = 0
        self.assertFalse(any(o["code"].startswith("trend") for o in self.engine.call("fixture-open", state=s)["view"]["public"]["observations"]))

    def test_support_and_resources(self):
        s = self.new()
        s["plan"]["parents"]["A"].update(work="heavy", care=4, bond=2, rest=1)
        self.assertIn("TIME_LIMIT", [r["code"] for r in self.observe(s)["public"]["forecast"]["reasons"]])
        for gh, gr, allowed in ((40, 30, True), (39, 30, False), (40, 29, False)):
            s = self.new(); s["grandparents"].update(health=gh, relation=gr); s["plan"]["help"] = "grand"
            for p in ("A", "B"): s["plan"]["parents"][p]["care"] = 2
            f = self.observe(s)["public"]["forecast"]
            self.assertEqual(f["care_required"], 4)
            self.assertEqual(not any(r["code"] == "HELP_UNAVAILABLE" for r in f["reasons"]), allowed)
        s = self.new(); s["plan"]["help"] = "paid"
        self.assertEqual(self.observe(s)["public"]["forecast"]["cost"], 228)

    def test_conditional_priority_and_cooldown(self):
        s = self.new(); s["n"] = 4; s["child"]["stress"] = 70
        s = self.engine.call("fixture-open", state=s)["state"]
        self.assertEqual([e["event_id"] for e in s["events"]], ["E-10"])
        s["n"] = 5
        s = self.engine.call("fixture-open", state=s)["state"]
        self.assertEqual([e["event_id"] for e in s["events"]], ["E-09"])
        s["n"] = 7
        self.assertNotIn("E-10", [e["event_id"] for e in self.engine.call("fixture-open", state=s)["state"]["events"]])
        s["n"] = 8
        self.assertIn("E-10", [e["event_id"] for e in self.engine.call("fixture-open", state=s)["state"]["events"]])

    def test_delayed_effects_success_failure_and_final_turn(self):
        for delay in ("L-01", "L-02"):
            for success in (True, False):
                s = self.new(); s["n"] = 26; s["events"] = []
                s["queue"] = [{"id": delay, "source": "t25:E-05", "target": "craft", "due_turn": 27}]
                s["plan"]["style"] = "respect" if success else "push"
                no_delay = copy.deepcopy(s); no_delay["queue"] = []
                a = self.advance(s); b = self.advance(no_delay)
                self.assertEqual(a["queue"], [])
                self.assertEqual(a["history"][-1]["related"], ["t25:E-05"])
                if delay == "L-01": self.assertEqual(a["child"]["ability"]["craft"] - b["child"]["ability"]["craft"], 2 if success else 0)
                else: self.assertEqual(a["child"]["trust"]["A"] - b["child"]["trust"]["A"], 2 if success else 0)
        s = self.new(); s["n"] = 37; s["child"]["stress"] = 80
        s = self.engine.call("fixture-open", state=s)["state"]
        s = self.advance(s)
        self.assertTrue(s["queue"])
        s = self.advance(s); s = self.advance(s)
        self.assertEqual(s["queue"], []); self.assertEqual(s["phase"], "finished")
        self.assertIn("t38:E-10", s["history"][2]["related"])

    def test_oddity_boundaries_and_cap(self):
        for value, event in ((0, "O-01"), (9, "O-01"), (10, "O-02"), (17, "O-02"), (18, "O-03"), (24, "O-03"), (25, None), (99, None)):
            s = self.advance(self.new(), value)
            ids = [e["event_id"] for e in s["history"][0]["events"] if e["event_id"].startswith("O-")]
            self.assertEqual(ids, [event] if event else [])
        s = self.new(); s["cash"] = 43
        for p in ("A", "B"): s["plan"]["parents"][p]["work"] = "reduced"
        s = self.advance(s, 10)
        self.assertEqual(s["cash"], 0)
        self.assertEqual(s["history"][0]["money"][0]["expense"], 223)
        s = self.new(); s["cash"] = 99998
        s = self.advance(s, 0)
        m = s["history"][0]["money"][0]
        self.assertEqual(m["cap_overflow"], 49)

    def test_adult_asymmetric_death_frozen_results_and_no_distance_score(self):
        s = self.new(); s["n"] = 40
        s["parents"]["A"]["health"] = 10
        s["parents"]["B"]["health"] = 100
        a = self.engine.call("fixture-adult", state=s)["state"]
        self.assertEqual(a["result"]["parents"]["A"]["death_age"], 65)
        self.assertEqual(a["result"]["parents"]["B"]["death_age"], 90)
        death = next(h for h in a["history"] if h["adult_result"]["parents"]["A"])
        self.assertEqual(death["adult_result"]["parents"]["A"], a["result"]["parents"]["A"])
        self.assertEqual(a["parents"]["A"]["age_months"], 65*12)
        self.assertTrue(any("伴侶" in line for line in death["text"]))


if __name__ == "__main__": unittest.main()
