#!/usr/bin/env python3
"""
Master Curriculum Reorganizer and Deduplicator
=============================================
Cleans ~/Downloads, deduplicates raw PDF archives, removes underscores,
builds deep recursive vault hierarchies, and generates Navigation MOCs.
Uses only the Python standard library.
"""

import os
from pathlib import Path
import re
import shutil
import sys


def print_step(title: str):
    print(f"\n{'='*70}\n {title}\n{'='*70}")


def clean_stray_directories(base_dir: Path):
    """Removes stray configuration folders in Downloads."""
    stray_obsidian = base_dir / ".obsidian"
    if stray_obsidian.exists() and stray_obsidian.is_dir():
        shutil.rmtree(stray_obsidian)
        print("  [Cleaned] Removed stray directory: ~/Downloads/.obsidian")


def deduplicate_pdf_archives(base_dir: Path):
    """Removes duplicate and redundant PDF files, renaming into clean English standards."""
    tai_pdf = base_dir / "TAI PDF"
    if tai_pdf.exists():
        print("  [Processing] Deduplicating and renaming 'TAI PDF'...")
        # Remove duplicate download markers like (1), (2)
        for f in tai_pdf.iterdir():
            if f.is_file() and ("(1)" in f.name or "(2)" in f.name):
                f.unlink()
                print(f"    - Deleted duplicate file: {f.name}")

        # Remove redundant French copies if English version exists
        for f in tai_pdf.iterdir():
            if f.is_file() and "version pour étudiants_ex.pdf" in f.name:
                f.unlink()
                print(f"    - Deleted redundant French file: {f.name}")

        # Standardize clean English filenames (no underscores, no French text)
        rename_map = {
            "TP1_TAI version pour étudiants_eng26.pdf": "TP 1. Image Fundamentals and Histograms (Student Guide).pdf",
            "TP1_TAI version pour étudiants_eng_ex.pdf": "TP 1. Image Fundamentals and Histograms (Exercises).pdf",
            "TAI_TP2.pdf": "TP 2. Advanced Spatial Filtering and Image Restoration.pdf",
            "Getreuer_2009_Contours_Pochoirs.pdf": "Getreuer 2009. Contour Stencils for Edge Adaptive Image Interpolation.pdf"
        }

        for old_name, new_name in rename_map.items():
            old_file = tai_pdf / old_name
            if old_file.exists():
                dest = tai_pdf / new_name
                old_file.rename(dest)
                print(f"    [Renamed] {old_name} -> {new_name}")


def standardize_vault_root(base_dir: Path) -> Path:
    """Renames TAI APDS_Vault to TAI APDS Vault (removing underscore)."""
    old_vault = base_dir / "TAI APDS_Vault"
    new_vault = base_dir / "TAI APDS Vault"

    if old_vault.exists() and not new_vault.exists():
        old_vault.rename(new_vault)
        print("  [Renamed Vault] 'TAI APDS_Vault' -> 'TAI APDS Vault' (No underscores)")
        return new_vault
    elif new_vault.exists():
        return new_vault
    return old_vault


def build_recursive_vault_hierarchy(vault_root: Path):
    """Restructures flat chapter folders into a deep recursive hierarchy with subfolders."""
    print("  [Restructuring] Building deep recursive subfolders in vault...")

    # Specification: Chapter -> Subfolder -> List of source file fragments
    structure_map = {
        "01. Introduction to Data Science": {
            "01.1. Theoretical Foundations": [
                "01.1. Data Science Foundations and CRISP-DM Workflow.md",
                "01.2. The Modern Data Ecosystem and Professional Roles.md"
            ],
            "01.2. Computational Environment": [
                "01.3. Setting Up the Professional Python and Data Science Environment.md"
            ],
            "01.3. Practical Tutorials": [
                "01.4. Tutorial 02 - Hospital Patient Cohort Initialization and Environment Audit.md"
            ]
        },
        "02. Python Programming Essentials": {
            "02.1. Runtime and Primitives": [
                "02.1. Python Runtime, Dynamic Typing, and Core Primitives.md",
                "02.10. Code Modularity, Packaging, and Standard Library Systems.md"
            ],
            "02.2. Data Structures and Memory Architecture": [
                "02.2. Python Lists, Sequence Operations, and Internal Memory Architecture.md",
                "02.3. Dictionaries, Sets, Tuples, and High-Performance Collections.md"
            ],
            "02.3. Control Flow and Streaming Systems": [
                "02.4. Control Flow, Conditionals, and Comprehensions Mastery.md",
                "02.5. Exhaustive Guide to Iteration, Iterables, and the Iterator Protocol.md",
                "02.6. Generators, Lazy Evaluation, and Asynchronous Streaming Pipelines.md",
                "02.7. The 1 Million Records Memory Explosion Autopsy and Production Streaming Solutions.md"
            ],
            "02.4. Object-Oriented Design and Error Handling": [
                "02.8. Object-Oriented Programming and Class Design Patterns.md",
                "02.9. Robust Exception Handling and Resource Management.md"
            ],
            "02.5. Practical Tutorials": [
                "02.11. Tutorial 03 - Modular Sales Inventory Processing Pipeline.md",
                "02.12. Tutorial 03 - Student Cohort Generation and Statistical Analysis System.md"
            ]
        },
        "03. Essential Python Libraries": {
            "03.1. Theoretical Foundations": [
                "03.1. Contextual Data Science Computing with NumPy and Pandas.md"
            ],
            "03.2. Practical Tutorials": [
                "03.2. Tutorial 04 - Multi-City Temperature Array Analysis with NumPy.md",
                "03.3. Tutorial 04 - Academic Performance Statistical Analysis with NumPy and Matplotlib.md",
                "03.4. Tutorial 04 - Hospital Department Patient Analytics with Pandas.md",
                "03.5. Tutorial 04 - Longitudinal Sales Forecasting Project.md"
            ]
        },
        "04. Data Cleansing and Preprocessing": {
            "04.1. Cleansing and Transformation Theory": [
                "04.1. Missing Data Mechanisms and Statistical Imputation.md",
                "04.2. Statistical Outlier Detection and Consistency Rectification.md",
                "04.3. Categorical Feature Encoding and Text Normalization.md",
                "04.4. Feature Scaling, Standardization, and Normalization Theory.md"
            ],
            "04.2. Practical Tutorials": [
                "04.5. Tutorial 05 - End-to-End Medical Cohort Preprocessing Pipeline.md",
                "04.6. Tutorial 05 - Titanic Predictive Modeling Pipeline and Classifier Evaluation.md"
            ]
        },
        "05. Exploratory Data Analysis": {
            "05.1. Analytical Principles": [
                "05.1. Exploratory Data Analysis Principles, Distributions, and Correlation Metrics.md"
            ]
        },
        "06. Advanced Image Processing (TAI)": {
            "06.1. Acquisition and Topology": [
                "06.1. Digital Image Acquisition, Matrix Topologies, and Fixed Thresholding (TP1).md",
                "06.2. Spatial Transformations, ROI Extraction, and Multi-Channel Histograms (TP1).md"
            ],
            "06.2. Spatial Restoration and Smoothing": [
                "06.3. Discrete Noise Models and Spatial Convolution Smoothing (TP2 Part 1).md",
                "06.4. Fast Integral Filtering and Adaptive Spatial Smoothing (TP2 Part 1 Homework).md"
            ],
            "06.3. Non-Linear Edge Preservation": [
                "06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md"
            ],
            "06.4. Mathematical Morphology": [
                "06.6. Mathematical Morphology, Cellular Counting, and Zhang-Suen Thinning (TP2 Part 3).md"
            ],
            "06.5. Contrast Dynamics and Equalization": [
                "06.7. Contrast Dynamics, Histogram Equalization, and CLAHE (TP2 Part 4).md"
            ],
            "06.6. Single-Frame Super-Resolution": [
                "06.8. Single-Frame Super-Resolution and Getreuer Contour Stencils (TP2 Part 5).md"
            ]
        }
    }

    # Execute file moves into subfolders
    for ch_name, subfolders in structure_map.items():
        ch_dir = vault_root / ch_name
        if not ch_dir.exists():
            continue

        for sub_name, file_list in subfolders.items():
            sub_dir = ch_dir / sub_name
            sub_dir.mkdir(parents=True, exist_ok=True)

            for target_file in file_list:
                # Find file anywhere inside chapter directory
                matches = list(ch_dir.rglob(target_file))
                if matches:
                    src_file = matches[0]
                    dest_file = sub_dir / target_file
                    if src_file != dest_file:
                        shutil.move(str(src_file), str(dest_file))
                        print(f"    [Organized] {target_file} -> {sub_name}/")


def create_chapter_navigation_mocs(vault_root: Path):
    """Generates index Map of Content (MOC) notes inside each chapter and subfolder."""
    print("  [Generating Navigation MOCs] Creating index hubs...")

    for ch_dir in sorted(vault_root.iterdir()):
        if not ch_dir.is_dir() or ch_dir.name in [".obsidian", "Libraries"]:
            continue

        moc_file = ch_dir / f"{ch_dir.name[:2]}.0. Chapter Overview and Navigation.md"
        sub_items = [d for d in sorted(ch_dir.iterdir()) if d.is_dir() and not d.name.startswith(".")]

        content = [
            f"# {ch_dir.name} - Chapter Overview and Navigation",
            "",
            "## 1. Chapter Structure",
            "```mermaid",
            "mindmap",
            f"  root(({ch_dir.name}))"
        ]

        for s in sub_items:
            content.append(f"    {s.name}")
            for doc in sorted(s.glob("*.md")):
                clean_stem = doc.stem
                content.append(f"      {clean_stem}")

        content.extend([
            "```",
            "",
            "## 2. Navigational Table of Contents",
            ""
        ])

        for s in sub_items:
            content.append(f"### {s.name}")
            for doc in sorted(s.glob("*.md")):
                content.append(f"- [[{doc.name}]]")
            content.append("")

        content.extend([
            "## 3. Prerequisite Library Links",
            "- Connects to foundations in [[00. Library Learning Roadmap]]",
            ""
        ])

        moc_file.write_text("\n".join(content), encoding="utf-8")
        print(f"    [MOC Created] {moc_file.name}")


def main():
    base_dir = Path.home() / "Downloads"
    if not (base_dir / "TAI APDS_Vault").exists() and not (base_dir / "TAI APDS Vault").exists():
        base_dir = Path.cwd().resolve()

    print_step("Phase 1: Cleaning Stray Configurations and Deduplicating PDF Archives")
    clean_stray_directories(base_dir)
    deduplicate_pdf_archives(base_dir)

    print_step("Phase 2: Standardizing Vault Root Directory")
    vault_root = standardize_vault_root(base_dir)

    print_step("Phase 3: Restructuring Deep Recursive Hierarchy")
    build_recursive_vault_hierarchy(vault_root)

    print_step("Phase 4: Generating Chapter Navigation MOCs")
    create_chapter_navigation_mocs(vault_root)

    print_step("Reorganization Completed Successfully!")
    print(f" Your vault is now located at: {vault_root.resolve()}")
    print(" You can now open this folder directly in Obsidian.\n")


if __name__ == "__main__":
    main()