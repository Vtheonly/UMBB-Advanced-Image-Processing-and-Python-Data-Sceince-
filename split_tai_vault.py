#!/usr/bin/env python3
"""
TAI Vault Extractor & Markdown Splitter
=======================================
Extracts all unified TAI knowledge base notes and library modules from a specification file.
Uses line-by-line state-machine parsing to prevent regex truncation on nested Mermaid
or Python code blocks.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import sys


class SafeVaultSplitter:
    HEADER_PATTERN = re.compile(
        r'^\s*(?:#{1,6}\s*(?:File|Path)\s*[:=\-]|={3,}\s*(?:FILE|PATH)\s*:)\s*[`\'"]?([^\n`\'"]+?)[`\'"]?\s*(?:={3,})?\s*$',
        re.IGNORECASE
    )

    @staticmethod
    def sanitize_path(raw_path: str) -> Path:
        cleaned = raw_path.strip().replace("\\", "/")
        cleaned = re.sub(r'^[a-zA-Z]:[/]?', '', cleaned).lstrip("/")
        parts = [p.strip() for p in cleaned.split("/") if p.strip() and p.strip() not in (".", "..")]
        target = Path(*parts)
        if target.suffix.lower() not in [".md", ".markdown", ".txt"]:
            target = target.with_suffix(".md")
        return target

    @classmethod
    def peel_outer_fences(cls, lines: list[str]) -> list[str]:
        start = 0
        while start < len(lines) and not lines[start].strip():
            start += 1
        end = len(lines) - 1
        while end >= start and not lines[end].strip():
            end -= 1

        if start > end:
            return []

        first = lines[start].strip()
        last = lines[end].strip()

        # Check if the block is enclosed by an outer markdown fence
        match = re.match(r'^(`{3,}|~{3,})(?:markdown|md)?\s*$', first, re.IGNORECASE)
        if match:
            fence = match.group(1)
            char = fence[0]
            closing_pattern = re.compile(r'^' + re.escape(char) + r'{' + str(len(fence)) + r',}\s*$')
            if closing_pattern.match(last):
                return lines[start + 1:end]
            return lines[start + 1:end + 1]
        return lines[start:end + 1]

    @classmethod
    def execute(cls, input_file: Path, output_dir: Path) -> int:
        if not input_file.exists():
            raise FileNotFoundError(f"Source file not found: {input_file}")

        text = input_file.read_text(encoding="utf-8")
        lines = text.splitlines()

        current_path: Path | None = None
        current_lines: list[str] = []
        files_written = 0

        def commit():
            nonlocal current_path, current_lines, files_written
            if current_path is not None and current_lines:
                cleaned = cls.peel_outer_fences(current_lines)
                dest = output_dir / current_path
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text("\n".join(cleaned).strip() + "\n", encoding="utf-8")
                print(f"  [Created Note] {dest}")
                files_written += 1
            current_path = None
            current_lines = []

        for line in lines:
            match = cls.HEADER_PATTERN.match(line)
            if match:
                commit()
                raw_path = match.group(1).strip()
                current_path = cls.sanitize_path(raw_path)
            elif current_path is not None:
                current_lines.append(line)

        commit()
        return files_written


def main():
    parser = argparse.ArgumentParser(description="Splits merged Markdown notes into an Obsidian Vault.")
    parser.add_argument("-i", "--input", type=str, default="tai_vault_spec.md", help="Path to input markdown file.")
    parser.add_argument("-o", "--output", type=str, default="../APDS/APDS_Vault", help="Destination vault directory.")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output).resolve()

    print(f"\n=======================================================")
    print(f" Extracting TAI Notes to Vault: {output_dir}")
    print(f" Source File                   : {input_path}")
    print(f"=======================================================\n")

    try:
        count = SafeVaultSplitter.execute(input_path, output_dir)
        print(f"\nExtraction complete! {count} notes created successfully.\n")
    except Exception as e:
        print(f"\nError during extraction: {e}\n", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()