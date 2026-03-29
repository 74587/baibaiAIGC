from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from aigc_records import load_records
from aigc_round_service import normalize_path
from docx_pipeline import _split_text_into_blocks, write_docx_text
from llm_client import chat_completion
from skill_round_helper import build_round_context


ROOT_DIR = Path(__file__).resolve().parents[1]


def import_document(source_path: str) -> dict[str, Any]:
    context = build_round_context(source_path)
    return {
        "docId": context.doc_id,
        "sourcePath": str(context.source_path),
        "sourceKind": context.source_kind,
        "inputTextPath": str(context.input_text_path),
        "outputTextPath": str(context.output_text_path),
        "manifestPath": str(context.manifest_path),
        "nextRound": context.round_number,
        "extractedFromDocx": context.extracted_from_docx,
    }


def get_document_status(source_path: str) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    context = build_round_context(normalized_source)
    records = load_records()
    entry = records.get(context.doc_id, {}) if isinstance(records, dict) else {}
    rounds = entry.get("rounds", []) if isinstance(entry, dict) else []
    completed_rounds = [item.get("round") for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)]
    completed_rounds.sort()
    latest_output_path = ""
    if rounds:
        latest_round = max((item for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)), key=lambda item: item["round"], default=None)
        if latest_round:
            latest_output_path = str(normalize_path(Path(str(latest_round.get("output_path", ""))))) if latest_round.get("output_path") else ""
    return {
        "docId": context.doc_id,
        "sourcePath": str(normalized_source),
        "sourceKind": context.source_kind,
        "completedRounds": completed_rounds,
        "nextRound": context.round_number,
        "currentInputPath": str(context.input_text_path),
        "currentOutputPath": str(context.output_text_path),
        "manifestPath": str(context.manifest_path),
        "latestOutputPath": latest_output_path,
        "extractedFromDocx": context.extracted_from_docx,
    }


def get_document_history(source_path: str) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    context = build_round_context(normalized_source)
    records = load_records()
    entry = records.get(context.doc_id, {}) if isinstance(records, dict) else {}
    rounds = entry.get("rounds", []) if isinstance(entry, dict) else []

    history_rounds: list[dict[str, Any]] = []
    for item in rounds:
        if not isinstance(item, dict):
            continue
        history_rounds.append(
            {
                "round": int(item.get("round", 0)),
                "prompt": str(item.get("prompt", "")),
                "inputPath": str(item.get("input_path", "")),
                "outputPath": str(item.get("output_path", "")),
                "manifestPath": str(item.get("manifest_path", "")),
                "scoreTotal": item.get("score_total"),
                "chunkLimit": item.get("chunk_limit"),
                "inputSegmentCount": item.get("input_segment_count"),
                "outputSegmentCount": item.get("output_segment_count"),
                "timestamp": str(item.get("timestamp", "")),
            }
        )

    history_rounds.sort(key=lambda item: item["round"], reverse=True)

    return {
        "docId": context.doc_id,
        "sourcePath": str(normalized_source),
        "rounds": history_rounds,
    }


def run_round_for_app(source_path: str, model_config: dict[str, Any], round_number: int | None = None) -> dict[str, Any]:
    from skill_round_helper import run_skill_round

    base_url = str(model_config.get("baseUrl", "")).strip()
    api_key = str(model_config.get("apiKey", "")).strip()
    model = str(model_config.get("model", "")).strip()
    temperature = float(model_config.get("temperature", 0.7))
    offline_mode = bool(model_config.get("offlineMode", False))

    if not offline_mode and (not base_url or not api_key or not model):
        raise ValueError("Model configuration is incomplete.")

    if offline_mode:
        def transform(chunk_text: str, _: str, __: int, ___: str) -> str:
            return chunk_text
    else:
        def transform(_: str, prompt_input: str, __: int, ___: str) -> str:
            return chat_completion(
                prompt_input,
                model=model,
                api_key=api_key,
                base_url=base_url,
                temperature=temperature,
            )

    result = run_skill_round(source_path, transform=transform, round_number=round_number)
    return {
        "round": int(result["round"]),
        "outputPath": str(result["output_path"]),
        "manifestPath": str(result["manifest_path"]),
        "chunkLimit": int(result["chunk_limit"]),
        "inputSegmentCount": int(result["input_segment_count"]),
        "outputSegmentCount": int(result["output_segment_count"]),
        "paragraphCount": int(result["paragraph_count"]),
        "offlineMode": offline_mode,
        "docEntry": result["doc_entry"],
        "skillContext": result["skill_context"],
    }


def export_round_output(output_path: str, export_path: str, target_format: str) -> dict[str, Any]:
    normalized_output_path = normalize_path(Path(output_path))
    normalized_export_path = Path(export_path).resolve()
    normalized_export_path.parent.mkdir(parents=True, exist_ok=True)

    if target_format == "txt":
        shutil.copyfile(normalized_output_path, normalized_export_path)
        return {
            "format": "txt",
            "path": str(normalized_export_path),
        }

    if target_format == "docx":
        text = normalized_output_path.read_text(encoding="utf-8")
        blocks = _split_text_into_blocks(text)
        write_docx_text(blocks, normalized_export_path)
        return {
            "format": "docx",
            "path": str(normalized_export_path),
        }

    raise ValueError(f"Unsupported export format: {target_format}")


def read_output_text(output_path: str) -> dict[str, Any]:
    normalized_output_path = normalize_path(Path(output_path))
    return {
        "path": str(normalized_output_path),
        "text": normalized_output_path.read_text(encoding="utf-8"),
    }


def load_model_config_payload(model_config_json: str | None = None, model_config_file: str | None = None) -> dict[str, Any]:
    if model_config_file:
        config_path = Path(model_config_file).resolve()
        return json.loads(config_path.read_text(encoding="utf-8"))
    if model_config_json:
        return json.loads(model_config_json)
    raise ValueError("Either model_config_json or model_config_file must be provided.")


def cli_main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Desktop app service bridge")
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser = subparsers.add_parser("import-document")
    import_parser.add_argument("source_path")

    status_parser = subparsers.add_parser("document-status")
    status_parser.add_argument("source_path")

    history_parser = subparsers.add_parser("document-history")
    history_parser.add_argument("source_path")

    run_parser = subparsers.add_parser("run-round")
    run_parser.add_argument("source_path")
    run_parser.add_argument("model_config_json", nargs="?", default=None)
    run_parser.add_argument("--config-file", default=None)
    run_parser.add_argument("--round", type=int, default=None)

    export_parser = subparsers.add_parser("export-round")
    export_parser.add_argument("output_path")
    export_parser.add_argument("export_path")
    export_parser.add_argument("target_format", choices=["txt", "docx"])

    preview_parser = subparsers.add_parser("read-output")
    preview_parser.add_argument("output_path")

    args = parser.parse_args()

    if args.command == "import-document":
        payload = import_document(args.source_path)
    elif args.command == "document-status":
        payload = get_document_status(args.source_path)
    elif args.command == "document-history":
        payload = get_document_history(args.source_path)
    elif args.command == "run-round":
        payload = run_round_for_app(
            args.source_path,
            load_model_config_payload(args.model_config_json, args.config_file),
            args.round,
        )
    elif args.command == "export-round":
        payload = export_round_output(args.output_path, args.export_path, args.target_format)
    elif args.command == "read-output":
        payload = read_output_text(args.output_path)
    else:
        raise ValueError(f"Unsupported command: {args.command}")

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    cli_main()
