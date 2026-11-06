#!/usr/bin/env python3
"""
Master Knowledge Base & APDS Vault Extractor
=============================================
Splits a monolithic `input.md` into a fully organized, deeply hierarchical
Obsidian Knowledge Base vault.

Features:
- State-machine code fence detection (prevents premature splits on Python/Mermaid).
- Dynamic Section 10 table parsing to map each note to its exact folder.
- Fallback heuristic routing based on numeric prefixes (00., 01., 02., etc.).
- Safe cleaning of markdown code-fence wrappers and boundary artifacts.
- Supports both standard modular output and direct TAI APDS Vault integration.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import os
from pathlib import Path
import re
import sys


class VaultExtractor:
    # Matches file declarations like:
    # ### 01.01. NumPy Foundations - Array Creation, Memory Layout, and Data Types.md
    # ### Exercise 1. Computing 2D Convolution and Boundary Padding.md
    # ### File: path/to/note.md
    FILE_HEADER_PATTERN = re.compile(
        r"^(?:#{1,4}\s*(?:File|Path)\s*[:=\-]\s*[`'\"]?([^\n`'\"]+?)[`'\"]?|###\s+([0-9a-zA-Z_\.\- /]+\.md))\s*$",
        re.IGNORECASE,
    )

    # Matches main section headings like:
    # ## 01. Unified Python Libraries Foundation
    # ## 03. Image Preprocessing, Filtering, and Restoration
    SECTION_HEADER_PATTERN = re.compile(
        r"^##\s+(\d{2}\.[^\n]+)$"
    )

    # Fallback directory map based on the two-digit chapter prefix
    DEFAULT_SECTION_MAP = {
        "00": "00. Navigation",
        "01": "01. Libraries",
        "02": "02. Foundations",
        "03": "03. Preprocessing",
        "04": "04. Segmentation",
        "05": "05. Super Resolution",
        "06": "06. Laboratories",
        "07": "07. Exercises",
        "08": "08. Question Banks",
        "09": "09. Projects",
        "10": "00. Navigation",
    }

    @staticmethod
    def parse_index_table(lines: list[str]) -> dict[str, str]:
        """
        Parses the Master Verification Matrix table in Section 10 to extract
        the exact target directory path for each markdown file.
        Matches table lines like:
        | `01. Libraries/01.01. NumPy Foundations...md` | ... |
        | 02. Foundations/02.1. Physical Image...md | ... |
        """
        table_map: dict[str, str] = {}
        row_regex = re.compile(
            r"\|\s*`?([0-9a-zA-Z_\.\- /]+\.md)`?\s*\|"
        )
        for line in lines:
            match = row_regex.search(line)
            if match:
                full_rel_path = match.group(1).strip()
                filename = Path(full_rel_path).name
                table_map[filename] = full_rel_path
        return table_map

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Removes illegal filesystem characters while preserving valid note names."""
        cleaned = filename.strip().replace("\\", "/")
        cleaned = re.sub(r'^[a-zA-Z]:[/]?', '', cleaned).lstrip("/")
        parts = [p.strip() for p in cleaned.split("/") if p.strip() and p.strip() not in (".", "..")]
        target = Path(*parts)
        if target.suffix.lower() not in [".md", ".markdown", ".txt"]:
            target = target.with_suffix(".md")
        return str(target)

    @classmethod
    def peel_outer_fences(cls, lines: list[str]) -> list[str]:
        """Strips accidental outer markdown code wrappers from LLM exports."""
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

        # Check if the entire note is wrapped inside an outer ```markdown fence
        match = re.match(r"^(`{3,}|~{3,})(?:markdown|md)?\s*$", first, re.IGNORECASE)
        if match:
            fence = match.group(1)
            char = fence[0]
            closing_pattern = re.compile(r"^" + re.escape(char) + r"{" + str(len(fence)) + r",}\s*$")
            if closing_pattern.match(last):
                lines = lines[start + 1 : end]
            else:
                lines = lines[start + 1 : end + 1]
        else:
            lines = lines[start : end + 1]

        # Strip dangling horizontal rules (---) at the very beginning or end of note
        while lines and (not lines[0].strip() or lines[0].strip() == "---"):
            lines.pop(0)
        while lines and (not lines[-1].strip() or lines[-1].strip() == "---"):
            lines.pop()

        return lines

    @classmethod
    def resolve_destination(
        cls,
        raw_name: str,
        current_section: str | None,
        table_map: dict[str, str],
        mode: str,
    ) -> Path:
        """Resolves the relative destination path for a given note."""
        filename = Path(raw_name).name

        # 1. Lookup in parsed Section 10 table if available
        if filename in table_map:
            rel_path_str = table_map[filename]
        # 2. Check if the header already provided a relative path (e.g. "01. Libraries/note.md")
        elif "/" in raw_name:
            rel_path_str = raw_name
        # 3. Fallback: Determine folder by prefix (e.g. "01.", "02.")
        else:
            prefix_match = re.match(r"^(\d{2})", filename)
            if prefix_match and prefix_match.group(1) in cls.DEFAULT_SECTION_MAP:
                folder = cls.DEFAULT_SECTION_MAP[prefix_match.group(1)]
            elif current_section:
                # Use current section title (e.g. "02. Introduction to Digital Images")
                folder = current_section
            else:
                folder = "Uncategorized"
            rel_path_str = f"{folder}/{filename}"

        dest_path = Path(cls.sanitize_filename(rel_path_str))

        # Adjust routing if integrating directly into existing 'TAI APDS Vault'
        if mode == "tai-vault":
            # Map 01. Libraries -> Libraries (to match existing vault folder)
            parts = list(dest_path.parts)
            if parts and parts[0] == "01. Libraries":
                parts[0] = "Libraries"
            dest_path = Path(*parts)
        elif mode == "flat":
            dest_path = Path(dest_path.name)

        return dest_path

    @classmethod
    def execute(cls, input_file: Path, output_dir: Path, mode: str = "standard") -> int:
        if not input_file.exists():
            raise FileNotFoundError(f"Source file not found: {input_file}")

        text = input_file.read_text(encoding="utf-8")
        raw_lines = text.splitlines()

        # Pre-pass: Parse Section 10 verification table for absolute path mapping
        table_map = cls.parse_index_table(raw_lines)
        if table_map:
            print(f"[*] Found internal Master Index Table: mapped {len(table_map)} note destinations.")

        current_path: Path | None = None
        current_lines: list[str] = []
        current_section: str | None = None
        files_written = 0
        folder_stats: dict[str, int] = defaultdict(int)

        # State-machine flags
        code_fence_char: str | None = None
        code_fence_len = 0

        def commit():
            nonlocal current_path, current_lines, files_written
            if current_path is not None and current_lines:
                cleaned = cls.peel_outer_fences(current_lines)
                if cleaned:
                    dest = output_dir / current_path
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    content = "\n".join(cleaned).strip() + "\n"
                    dest.write_text(content, encoding="utf-8")
                    folder_stats[dest.parent.name] += 1
                    files_written += 1
                    print(f"  [+] Extracted: {dest.relative_to(output_dir)}")
            current_path = None
            current_lines = []

        for line in raw_lines:
            stripped = line.strip()

            # --- Code Fence State Machine ---
            # Handles ``` and ~~~ code blocks to protect inner comments/headers
            fence_match = re.match(r"^(`{3,}|~{3,})", stripped)
            if fence_match:
                marker = fence_match.group(1)
                char = marker[0]
                length = len(marker)
                if code_fence_char is None:
                    code_fence_char = char
                    code_fence_len = length
                elif code_fence_char == char and length >= code_fence_len:
                    code_fence_char = None
                    code_fence_len = 0

            # If inside a code fence, preserve the line as verbatim code
            if code_fence_char is not None:
                if current_path is not None:
                    current_lines.append(line)
                continue

            # --- Section Header Detection ---
            sec_match = cls.SECTION_HEADER_PATTERN.match(line)
            if sec_match:
                current_section = sec_match.group(1).strip()
                # If Section 10 is reached, treat the Verification Matrix as an extra note
                if current_section.startswith("10."):
                    commit()
                    target_name = "00.0. Master Verification Matrix and File Map.md"
                    current_path = cls.resolve_destination(target_name, "00. Navigation", table_map, mode)
                    continue

            # --- File Header Detection ---
            file_match = cls.FILE_HEADER_PATTERN.match(line)
            if file_match:
                commit()
                raw_target = file_match.group(1) or file_match.group(2)
                current_path = cls.resolve_destination(raw_target, current_section, table_map, mode)
                continue

            # --- Buffer Accumulation ---
            if current_path is not None:
                current_lines.append(line)

        # Commit final note
        commit()

        # Print Folder Summary
        print(f"\n{'-'*55}")
        print(f" Extraction Summary by Category:")
        print(f"{'-'*55}")
        for folder, count in sorted(folder_stats.items()):
            print(f"  * {folder:<30} : {count:>2} notes")
        print(f"{'-'*55}")

        return files_written


def main():
    parser = argparse.ArgumentParser(
        description="Splits merged 'input.md' into a complete Obsidian Vault.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "-i",
        "--input",
        type=str,
        default="input.md",
        help="Path to the input monolithic markdown file (default: input.md)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default="TAI APDS Vault",
        help="Target Vault directory path (default: 'TAI APDS Vault')",
    )
    parser.add_argument(
        "--mode",
        choices=["standard", "tai-vault", "flat"],
        default="tai-vault",
        help=(
            "Routing mode:\n"
            "  'tai-vault' (default): Merges into existing 'TAI APDS Vault' (uses 'Libraries/' folder).\n"
            "  'standard'          : Uses canonical numbers ('00. Navigation', '01. Libraries', etc.).\n"
            "  'flat'              : Writes all notes directly into the root destination without folders."
        ),
    )

    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()

    print("\n" + "=" * 65)
    print(" Master Knowledge Base Vault Extractor")
    print("=" * 65)
    print(f" Source File       : {input_path}")
    print(f" Destination Vault : {output_dir}")
    print(f" Mode              : {args.mode}")
    print("=" * 65 + "\n")

    try:
        count = VaultExtractor.execute(input_path, output_dir, mode=args.mode)
        print(f"\n[OK] Success! {count} notes successfully written to: {output_dir}\n")
    except Exception as e:
        print(f"\n[!] Error during extraction: {e}\n", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()