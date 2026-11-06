#!/usr/bin/env python3
"""
TAI APDS Vault Deduplicator and Chapter Integrator
===================================================
Directly resolves conflicting numbered folders (02. Foundations, 03. Preprocessing, etc.)
by merging their educational content into:
  - '06. Advanced Image Processing (TAI)/'
  - 'Libraries/'

It deletes the rogue folders, eliminates duplicated files, and rewrites all Obsidian
wikilinks across the vault.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import os
from pathlib import Path
import re
import shutil
import sys
import zipfile


class VaultCleaner:
    # Source file in rogue folder -> Authoritative destination in TAI / Libraries
    CONSOLIDATION_PLAN = {
        # --- Libraries Cleanup ---
        "Libraries/01.03. NumPy Broadcasting Mechanics and Vectorized Computations.md": (
            "Libraries/04. NumPy Mathematical Engine - Vectorization, ufuncs, and Broadcasting Rules.md"
        ),
        "Libraries/01.11. OpenCV Color Space Transformations and Pixel Math.md": (
            "Libraries/16. OpenCV Core Architecture - Matrix Representation, Channels, and Color Constellations.md"
        ),
        "Libraries/01.13. SciPy Signal and Spatial Operations - 2D Filtering and Morphology.md": (
            "Libraries/19. Spatial Image Restoration - Noise Models, Linear Convolution, and Fast Integral Filters.md"
        ),

        # --- 02. Foundations -> 06.1. Acquisition and Topology ---
        "02. Foundations/02.1. Physical Image Formation and Optical Sensing.md": (
            "06. Advanced Image Processing (TAI)/06.1. Acquisition and Topology/06.1. Digital Image Acquisition, Matrix Topologies, and Fixed Thresholding (TP1).md"
        ),
        "02. Foundations/02.2. Discretization - Spatial Sampling and Nyquist-Shannon Theorem.md": (
            "06. Advanced Image Processing (TAI)/06.1. Acquisition and Topology/06.1. Digital Image Acquisition, Matrix Topologies, and Fixed Thresholding (TP1).md"
        ),
        "02. Foundations/02.4. Image Representations - Raster Matrix vs Mathematical Vector Primitives.md": (
            "06. Advanced Image Processing (TAI)/06.1. Acquisition and Topology/06.2. Spatial Transformations, ROI Extraction, and Multi-Channel Histograms (TP1).md"
        ),

        # --- 03. Preprocessing -> 06.2. Spatial Restoration & 06.3. Non-Linear ---
        "03. Preprocessing/03.3. Linear Smoothing Filters - Box Mean and Separable Gaussian Convolutions.md": (
            "06. Advanced Image Processing (TAI)/06.2. Spatial Restoration and Smoothing/06.3. Discrete Noise Models and Spatial Convolution Smoothing (TP2 Part 1).md"
        ),
        "03. Preprocessing/03.4. Spatial High-Pass Filtering - Differential Operators and Laplacian Sharpening.md": (
            "06. Advanced Image Processing (TAI)/06.2. Spatial Restoration and Smoothing/06.3. Discrete Noise Models and Spatial Convolution Smoothing (TP2 Part 1).md"
        ),
        "03. Preprocessing/03.8. Specialized Spectral Operators - Band-Reject Notch Filters and Directional Gabor Filter Banks.md": (
            "06. Advanced Image Processing (TAI)/06.2. Spatial Restoration and Smoothing/06.4. Fast Integral Filtering and Adaptive Spatial Smoothing (TP2 Part 1 Homework).md"
        ),
        "03. Preprocessing/03.5. Order-Statistic Non-Linear Filtering - Median and Rank-Order Min-Max Operators.md": (
            "06. Advanced Image Processing (TAI)/06.3. Non-Linear Edge Preservation/06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
        ),
        "03. Preprocessing/03.6. Structural Edge-Preserving Smoothing - The Nagao Adaptive Multi-Sector Filter.md": (
            "06. Advanced Image Processing (TAI)/06.3. Non-Linear Edge Preservation/06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
        ),
        "03. Preprocessing/03.9. Non-Linear Boundary-Preserving Filtering - The Joint Spatial-Radiometric Bilateral Filter.md": (
            "06. Advanced Image Processing (TAI)/06.3. Non-Linear Edge Preservation/06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
        ),
        "03. Preprocessing/03.10. Partial Differential Equations in Restoration - Perona-Malik Anisotropic Diffusion.md": (
            "06. Advanced Image Processing (TAI)/06.3. Non-Linear Edge Preservation/06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
        ),
        "03. Preprocessing/03.11. Feature Space Clustering Segmentation - Mean-Shift and 2SP-DBSCAN.md": (
            "06. Advanced Image Processing (TAI)/06.3. Non-Linear Edge Preservation/06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
        ),
        "03. Preprocessing/03.16. Deep Learning Denoising Architectures - From Patch MLPs to Residual DnCNN and Uformer.md": (
            "06. Advanced Image Processing (TAI)/06.3. Non-Linear Edge Preservation/06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
        ),

        # --- 04. Segmentation -> 06. Advanced Image Processing (TAI)/06.7. Segmentation ---
        "04. Segmentation/04.1. Formal Segmentation Axioms and Homogeneity Predicates.md": (
            "06. Advanced Image Processing (TAI)/06.7. Segmentation and Feature Extraction/06.9. Image Segmentation Axioms, Thresholding, and Connected Components.md"
        ),
        "04. Segmentation/04.3. Local Adaptive Thresholding - Niblack and Dynamic Range-Constrained Sauvola Algorithms.md": (
            "06. Advanced Image Processing (TAI)/06.7. Segmentation and Feature Extraction/06.9. Image Segmentation Axioms, Thresholding, and Connected Components.md"
        ),
        "04. Segmentation/04.5. Morphological Watershed Segmentation and Topological Distance Transforms.md": (
            "06. Advanced Image Processing (TAI)/06.7. Segmentation and Feature Extraction/06.9. Image Segmentation Axioms, Thresholding, and Connected Components.md"
        ),
        "04. Segmentation/04.6. Connected Component Analysis - Two-Pass Labeling and Equivalence Trees.md": (
            "06. Advanced Image Processing (TAI)/06.7. Segmentation and Feature Extraction/06.9. Image Segmentation Axioms, Thresholding, and Connected Components.md"
        ),

        # --- 05. Super Resolution -> 06.6. Single-Frame Super-Resolution ---
        "05. Super Resolution/05.2. Directional Reconstruction - Contour Stencils and Total Variation Minimization.md": (
            "06. Advanced Image Processing (TAI)/06.6. Single-Frame Super-Resolution/06.8. Single-Frame Super-Resolution and Getreuer Contour Stencils (TP2 Part 5).md"
        ),
        "05. Super Resolution/05.4. Document Image Enhancement - Bi-ESRGAN Dual Path Architecture.md": (
            "06. Advanced Image Processing (TAI)/06.6. Single-Frame Super-Resolution/06.8. Single-Frame Super-Resolution and Getreuer Contour Stencils (TP2 Part 5).md"
        ),

        # --- Laboratories, Exercises, Projects -> 06.8. Practical Exercises ---
        "06. Laboratories/06.3. Laboratory 3 - Algorithmic Engineering of the Nagao Edge-Preserving Filter.md": (
            "06. Advanced Image Processing (TAI)/06.8. Practical Exercises and Solutions/06.10. Worked Image Processing Exercises and End-to-End Solutions.md"
        ),
        "07. Exercises/07.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes.md": (
            "06. Advanced Image Processing (TAI)/06.8. Practical Exercises and Solutions/06.10. Worked Image Processing Exercises and End-to-End Solutions.md"
        ),
        "07. Exercises/07.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation.md": (
            "06. Advanced Image Processing (TAI)/06.8. Practical Exercises and Solutions/06.10. Worked Image Processing Exercises and End-to-End Solutions.md"
        ),
        "09. Projects/09.1. Applied Project - End-to-End Document Cleaning and Text Extraction Pipeline.md": (
            "06. Advanced Image Processing (TAI)/06.8. Practical Exercises and Solutions/06.10. Worked Image Processing Exercises and End-to-End Solutions.md"
        ),

        # --- 00. Navigation -> Curriculum MOC & Roadmap ---
        "00. Navigation/00.0. Master Verification Matrix and File Map.md": (
            "06. Advanced Image Processing (TAI)/06.0. Advanced Image Processing Index and Curriculum MOC.md"
        ),
        "00. Navigation/00.1. Master Index and Knowledge Graph MOC.md": (
            "06. Advanced Image Processing (TAI)/06.0. Advanced Image Processing Index and Curriculum MOC.md"
        ),
        "00. Navigation/00.2. Course Roadmap and Unified Learning Path.md": (
            "00. Master Curriculum Roadmap.md"
        ),
    }

    ROGUE_FOLDERS = [
        "00. Navigation",
        "02. Foundations",
        "03. Preprocessing",
        "04. Segmentation",
        "05. Super Resolution",
        "06. Laboratories",
        "07. Exercises",
        "09. Projects",
    ]

    def __init__(self, vault_dir: Path, dry_run: bool = False):
        self.vault_dir = vault_dir.resolve()
        self.dry_run = dry_run
        self.link_map: dict[str, str] = {}
        for src, dest in self.CONSOLIDATION_PLAN.items():
            self.link_map[Path(src).stem] = Path(dest).stem

    def create_backup(self) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_zip = self.vault_dir.parent / f"backup_before_unify_{timestamp}.zip"
        print(f"[*] Creating zip backup of vault at: {backup_zip.name}")
        with zipfile.ZipFile(backup_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(self.vault_dir):
                for f in files:
                    full_p = Path(root) / f
                    zf.write(full_p, full_p.relative_to(self.vault_dir))
        print(f"[OK] Backup created.\n")
        return backup_zip

    @staticmethod
    def extract_unique_body(src_text: str) -> str:
        """Strips duplicate top-level title and clean lines from source note."""
        lines = src_text.splitlines()
        # Skip leading title if present
        while lines and (lines[0].startswith("# ") or not lines[0].strip() or lines[0].strip() == "---"):
            lines.pop(0)
        return "\n".join(lines).strip()

    def merge_and_relocate(self):
        print("[*] Merging fragmented content into authoritative chapter files...")
        merged_count = 0

        for src_rel, dest_rel in self.CONSOLIDATION_PLAN.items():
            src_file = self.vault_dir / src_rel
            dest_file = self.vault_dir / dest_rel

            if not src_file.exists():
                continue

            src_content = src_file.read_text(encoding="utf-8")
            clean_body = self.extract_unique_body(src_content)

            if not dest_file.exists():
                # Destination does not exist: create it with the source content
                if not self.dry_run:
                    dest_file.parent.mkdir(parents=True, exist_ok=True)
                    dest_file.write_text(src_content, encoding="utf-8")
                    src_file.unlink()
                print(f"  [Created Target] {dest_rel}")
            else:
                # Destination exists: append source content under an integrated section
                dest_content = dest_file.read_text(encoding="utf-8")
                # Avoid exact duplicate content injection
                if clean_body[:100].lower() not in dest_content.lower():
                    heading = f"\n\n---\n\n## Integrated Subject Knowledge: {src_file.stem}\n\n"
                    merged = dest_content.rstrip() + heading + clean_body + "\n"
                    if not self.dry_run:
                        dest_file.write_text(merged, encoding="utf-8")
                        src_file.unlink()
                    print(f"  [Merged Content] {src_rel} -> {dest_rel}")
                else:
                    if not self.dry_run:
                        src_file.unlink()
                    print(f"  [Already Merged / Removed] {src_rel}")

            merged_count += 1

        print(f"[OK] Consolidated {merged_count} notes.\n")

    def remove_rogue_folders(self):
        print("[*] Deleting rogue duplicate folders from top level...")
        for folder_name in self.ROGUE_FOLDERS:
            folder_path = self.vault_dir / folder_name
            if folder_path.exists() and folder_path.is_dir():
                if not self.dry_run:
                    shutil.rmtree(folder_path, ignore_errors=True)
                print(f"  [DELETED FOLDER] {folder_name}/")

        print("[OK] Top-level vault cleaned of all duplicate green folders.\n")

    def update_wikilinks(self):
        print("[*] Harmonizing Obsidian wikilinks across all notes...")
        updated = 0
        link_regex = re.compile(r"\[\[([^\|\]]+?)(\|[^\]]+)?\]\]")

        def replace_target(m: re.Match) -> str:
            target = m.group(1).strip()
            display = m.group(2) or ""
            if target in self.link_map:
                new_stem = self.link_map[target]
                return f"[[{new_stem}{display}]]"
            return m.group(0)

        for md in self.vault_dir.rglob("*.md"):
            content = md.read_text(encoding="utf-8")
            new_content = link_regex.sub(replace_target, content)
            if new_content != content:
                if not self.dry_run:
                    md.write_text(new_content, encoding="utf-8")
                updated += 1

        print(f"[OK] Updated internal links across {updated} files.\n")


def main():
    parser = argparse.ArgumentParser(description="Clean and unify TAI APDS Vault.")
    parser.add_argument(
        "-v",
        "--vault",
        type=str,
        default="TAI APDS Vault",
        help="Path to TAI APDS Vault (default: 'TAI APDS Vault')",
    )
    parser.add_argument("--dry-run", action="store_true", help="Simulate actions without changes.")
    parser.add_argument("--no-backup", action="store_true", help="Skip zip backup.")

    args = parser.parse_args()
    vault_path = Path(args.vault).resolve()

    if not vault_path.exists():
        print(f"[!] Directory not found: {vault_path}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 65)
    print(" TAI APDS Vault Deep Integrator & Folder Fixer")
    print("=" * 65)
    print(f" Target: {vault_path}")
    print(f" Mode  : {'DRY RUN' if args.dry_run else 'LIVE MERGE & CLEAN'}")
    print("=" * 65 + "\n")

    cleaner = VaultCleaner(vault_path, dry_run=args.dry_run)

    if not args.dry_run and not args.no_backup:
        cleaner.create_backup()

    cleaner.merge_and_relocate()
    cleaner.remove_rogue_folders()
    cleaner.update_wikilinks()

    print("=" * 65)
    print(" [OK] VAULT RESTORATION COMPLETE")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()