"""Public input schema and errors. Hidden game state is not input."""
import copy
import json
import re

VERSIONS = {"rules": "rules-1", "data": "data-1", "save": "save-1"}
UPDATES = {"plan", "choose", "reset-plan", "advance"}
READS = {"observe", "actions", "forecast", "history", "result", "debug-state"}
COMMANDS = UPDATES | READS | {"new", "replay", "scenarios"}
ENUMS = {"work": ["reduced", "normal", "heavy"], "domain": ["none", "study", "craft"],
         "sponsor": ["A", "B"], "style": ["respect", "coach", "push"], "help": ["none", "grand", "paid"]}
RANGES = {"care": (0, 6), "bond": (0, 2), "rest": (0, 3), "self": (0, 2), "level": (0, 2)}
CODES = {
    2: "INVALID_INPUT UNKNOWN_COMMAND UNKNOWN_ACTION", 3: "RESOURCE_LIMIT ANSWER_REQUIRED FINISHED NOT_FINISHED",
    4: "STALE_REVISION REQUEST_ID_CONFLICT RUN_EXISTS RUN_LOCKED",
    5: "RUN_NOT_FOUND INCOMPLETE_RUN CORRUPT_SAVE VERSION_MISMATCH IO_ERROR",
    6: "REPLAY_MISMATCH INTERNAL_ERROR"}


class Failure(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message)
        self.code, self.message, self.details = code, message, details or []
        self.exit_code = next(n for n, codes in CODES.items() if code in codes.split())


def invalid(message, path="input"):
    raise Failure("INVALID_INPUT", message, [{"path": path, "reason": message}])


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                invalid("JSONに重複したキーがあります", key)
            result[key] = value
        return result
    try:
        return json.loads(data, object_pairs_hook=pairs,
                          parse_constant=lambda _: invalid("NaN/Infinityは使えません"),
                          parse_float=lambda _: invalid("小数は使えません"))
    except (ValueError, UnicodeError):
        invalid("UTF-8 JSONとして読み込めません")


def bounded(value, low, high, path):
    if type(value) is not int or not low <= value <= high:
        invalid("%d〜%dの整数が必要です" % (low, high), path)


def request_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value):
        invalid("request-idはASCII英数字・ハイフン・下線の1〜64文字です", "request-id")


def validate_patch(patch):
    def walk(obj, allowed, path):
        if not isinstance(obj, dict) or not obj:
            invalid("空でないオブジェクトが必要です", path)
        for key, value in obj.items():
            location = path + "." + key if path else key
            if key not in allowed:
                invalid("未知の項目です", location)
            if key == "parents": walk(value, {"A", "B"}, location)
            elif key in {"A", "B"}: walk(value, {"work", "care", "bond", "rest", "self"}, location)
            elif key == "activity": walk(value, {"domain", "level", "sponsor"}, location)
            elif key in ENUMS:
                if not isinstance(value, str) or value not in ENUMS[key]: invalid("選択値が不正です", location)
            else: bounded(value, *RANGES[key], location)
    walk(patch, {"parents", "activity", "style", "help"}, "")


def merge_plan(plan, patch):
    result = copy.deepcopy(plan)
    def merge(dst, src):
        for key, value in src.items():
            if isinstance(value, dict): merge(dst[key], value)
            else: dst[key] = value
    merge(result, patch)
    a = result["activity"]
    if (a["domain"] == "none") != (a["level"] == 0):
        invalid("活動なしはlevel=0、活動ありはlevel=1または2にしてください", "activity")
    return result


def validate_choice(choice):
    if not isinstance(choice, dict) or set(choice) != {"event_instance", "option_id"}:
        invalid("event_instanceとoption_idの2項目が必要です")
    if any(not isinstance(v, str) for v in choice.values()): invalid("選択IDは文字列です")


def actions(choices):
    fields = []
    def field(path, key):
        fields.append({"path": path, "type": "string" if key in ENUMS else "integer",
                       "enum": ENUMS.get(key), "min": RANGES[key][0] if key in RANGES else None,
                       "max": RANGES[key][1] if key in RANGES else None,
                       "required_with": "activity.level/domainの整合性" if key in {"level", "domain"} else None})
    for person in ("A", "B"):
        for key in ("work", "care", "bond", "rest", "self"): field("parents." + person + "." + key, key)
    for key in ("domain", "level", "sponsor"): field("activity." + key, key)
    for key in ("style", "help"): field(key, key)
    required = {"new": ["run", "scenario", "seed", "request-id"], "replay": ["run", "out", "request-id"], "scenarios": []}
    for name in UPDATES: required[name] = ["run", "revision", "request-id"] + (["input"] if name in {"plan", "choose"} else [])
    for name in READS: required[name] = ["run"]
    example = {"event_instance": choices[0]["instance_id"], "option_id": choices[0]["options"][0]["option_id"]} if choices else None
    return {"commands": [{"id": name, "required_args": required[name]} for name in sorted(COMMANDS)],
            "plan_fields": fields, "input_examples": {"plan": {"parents": {"A": {"rest": 2}}}, "choose": example}}
