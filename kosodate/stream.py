"""Persistent public JSON-lines transport for CLI test players."""
import sys
from .contract import Failure, canonical, invalid, strict_json


def serve(service):
    while True:
        data = sys.stdin.buffer.readline(65537)
        if not data: return 0
        command = ""
        try:
            if len(data) > 65536:
                while data and not data.endswith(b"\n"): data = sys.stdin.buffer.readline(65537)
                invalid("入力は1行64KiB以内にしてください")
            request = strict_json(data)
            if not isinstance(request, dict): invalid("コマンドを持つオブジェクトが必要です")
            command = request.pop("command", "")
            if not isinstance(command, str): invalid("commandは文字列です")
            response, code = service.execute(command, **request)
        except Failure as failure:
            response, code = service.envelope(command, error=failure), failure.exit_code
        print(canonical({"response": response, "exit_code": code}), flush=True)
