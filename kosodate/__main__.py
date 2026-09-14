import argparse
from pathlib import Path
import sys

from .contract import Failure, canonical, invalid, strict_json
from .service import Service
from .text import render


class Parser(argparse.ArgumentParser):
    def error(self, message):
        invalid(message, "arguments")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    command = argv[0] if argv and not argv[0].startswith("-") else ""
    service = Service()
    output_format = "json"
    try:
        parser = Parser(description="親伝説 — Become a Parent：Godotで動く40ターンの人生。guiで画面、playで対話、JSONコマンドでエージェントが遊べます。", allow_abbrev=False)
        parser.add_argument("command", help="gui / play / scenarios / new / observe / actions / plan / choose / reset-plan / advance / forecast / history / result / replay / debug-state")
        parser.add_argument("--port", type=int, help="GUIのローカルポート（省略時は空きポート）")
        parser.add_argument("--no-browser", action="store_true", default=None, help="GUIのブラウザ自動起動を省略")
        for flag in ("run", "out", "scenario", "request-id", "input"):
            parser.add_argument("--" + flag)
        for flag in ("seed", "revision", "offset", "limit"):
            parser.add_argument("--" + flag, type=int)
        parser.add_argument("--format", choices=("json", "text"), default="json")
        ns = parser.parse_args(argv)
        output_format = ns.format
        command = ns.command
        args = {k: v for k, v in vars(ns).items() if v is not None and k not in {"command", "format"}}
        if command == "gui":
            if "run" not in args: invalid("--runで保存先を指定してください", "run")
            if set(args) - {"run", "scenario", "seed", "port", "no_browser"} or output_format != "json":
                invalid("guiではrun、scenario、seed、port、no-browserを指定できます")
            from .contract import bounded
            bounded(args.get("port", 0), 0, 65535, "port")
            from .gui import gui
            try:
                return gui(service, args["run"], args.get("scenario", "home-01"), args.get("seed", 0),
                           args.get("port", 0), not args.get("no_browser", False))
            except OSError:
                raise Failure("IO_ERROR", "画面を起動できません。保存先やポートを確認してください。")
        if command == "serve":
            if args or output_format != "json": invalid("serveは引数なし・JSON形式で利用します")
            from .stream import serve
            return serve(service)
        if command == "play":
            if "run" not in args: invalid("--runで保存先を指定してください", "run")
            if set(args) - {"run", "scenario", "seed"}: invalid("playではrun、scenario、seedを指定できます")
            from .play import play
            return play(service, args["run"], args.get("scenario", "home-01"), args.get("seed", 0))
        if "input" in args:
            try:
                if args["input"] == "-": data = sys.stdin.buffer.read(65537)
                else:
                    with open(args["input"], "rb") as f: data = f.read(65537)
            except OSError:
                raise Failure("IO_ERROR", "入力ファイルを読み込めません。")
            if len(data) > 65536: invalid("入力は64KiB以内にしてください")
            args["input"] = strict_json(data)
        response, code = service.execute(command, **args)
    except Failure as failure:
        response, code = service.envelope(command, error=failure), failure.exit_code
    finally:
        service.close()
    print(render(response) if output_format == "text" else canonical(response))
    return code


if __name__ == "__main__":
    sys.exit(main())
