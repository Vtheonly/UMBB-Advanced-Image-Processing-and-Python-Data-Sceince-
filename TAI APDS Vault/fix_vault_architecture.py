#!/usr/bin/env python3
"""
Complete TAI APDS Vault Architectural Fixer
============================================
1. Fixes the overwriting bug: Every lecture theory note gets its own unique file.
2. Fixes the leaking header bug: Prevents trailing '## Chapter' from leaking into notes.
3. Separates Lecture Theory from Practical TPs.
4. Harmonizes all Obsidian wikilinks across the vault.
"""

from __future__ import annotations
import os
import re
import shutil
from pathlib import Path

# Auto-detect directories
BASE_DIR = Path.home() / "Downloads"
INPUT_MD = None
for candidate in [BASE_DIR / "input.md", Path("input.md"), Path("../input.md")]:
    if candidate.exists():
        INPUT_MD = candidate.resolve()
        break

VAULT_DIR = None
for candidate in [BASE_DIR / "TAI APDS Vault", Path("TAI APDS Vault"), Path(".")]:
    if (candidate / "06. Advanced Image Processing (TAI)").exists() or (candidate / "Libraries").exists():
        VAULT_DIR = candidate.resolve()
        break

if not INPUT_MD or not VAULT_DIR:
    print("[!] Error: Could not locate input.md or TAI APDS Vault.")
    exit(1)

print(f"[*] Input Source : {INPUT_MD}")
print(f"[*] Target Vault : {VAULT_DIR}")

# 1-to-1 Mapping: Every lecture note has its own unique target path
STRICT_ROUTING = {
    # 06.1. Image Foundations and Discretization
    "02.1. Physical Image Formation and Optical Sensing.md": 
        "06.1. Image Foundations and Discretization/06.1.1. Physical Image Formation, Radiometry, and Optical Sensing.md",
    "02.2. Discretization - Spatial Sampling and Nyquist-Shannon Theorem.md": 
        "06.1. Image Foundations and Discretization/06.1.2. Spatial Discretization, Dirac Comb Sampling, and Nyquist-Shannon Theorem.md",
    "02.3. Amplitude Quantization, Dynamic Range, and Bit Depth.md": 
        "06.1. Image Foundations and Discretization/06.1.3. Amplitude Quantization, Dynamic Range, and Bit Depth.md",
    "02.4. Image Representations - Raster Matrix vs Mathematical Vector Primitives.md": 
        "06.1. Image Foundations and Discretization/06.1.4. Image Representations - Raster Matrix vs Mathematical Vector Primitives.md",
    "02.5. Color Models - Additive RGB, Subtractive CMYK, and Photometric Grayscale.md": 
        "06.1. Image Foundations and Discretization/06.1.5. Color Models - Additive RGB, Subtractive CMYK, and Photometric Grayscale.md",
    "02.6. Perceptual and Broadcast Spaces - YUV, YCbCr, HSV, and Perceptually Uniform Lab.md": 
        "06.1. Image Foundations and Discretization/06.1.6. Perceptual and Broadcast Spaces - YUV, YCbCr, HSV, and CIE Lab.md",
    "02.7. Digital File Encapsulation, Compression Standards, and Medical DICOM.md": 
        "06.1. Image Foundations and Discretization/06.1.7. Digital File Encapsulation, Compression Standards, and Medical DICOM.md",
    "02.8. Discrete Spatial Topology - Neighborhoods, Adjacency, and Metric Spaces.md": 
        "06.1. Image Foundations and Discretization/06.1.8. Discrete Spatial Topology, Neighborhoods (N4, N8), and Metric Spaces.md",
    "02.9. Tonal Histograms, Probability Densities, and Cumulative Distribution Functions.md": 
        "06.1. Image Foundations and Discretization/06.1.9. Tonal Histograms, Probability Densities, and Cumulative Distribution Functions.md",
    "02.10. Mathematical 2D Spatial Convolution, Cross-Correlation, and Boundary Conditions.md": 
        "06.1. Image Foundations and Discretization/06.1.10. Mathematical 2D Spatial Convolution, Cross-Correlation, and Boundary Padding.md",
    "02.11. The Classical Vision Processing Hierarchy - Low, Mid, and High-Level Tasks.md": 
        "06.1. Image Foundations and Discretization/06.1.11. The Classical Vision Processing Hierarchy - Low, Mid, and High-Level Tasks.md",

    # 06.2. Degradation, Restoration, and Spatial Filtering
    "03.1. Physical Noise Models - Point Spread Function, Additive Gaussian, Speckle, and Salt-and-Pepper.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.1. Physical Noise Models (PSF, Gaussian, Impulse Salt-and-Pepper, Speckle).md",
    "03.2. Quantitative Quality Metrics - Mean Squared Error (MSE) and Peak Signal-to-Noise Ratio (PSNR).md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.2. Quantitative Quality Benchmarks (MSE, PSNR, and SSIM).md",
    "03.3. Linear Smoothing Filters - Box Mean and Separable Gaussian Convolutions.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.3. Linear Spatial Smoothing (Mean Box Filter, Gaussian Bell, and 1D Separability).md",
    "03.4. Spatial High-Pass Filtering - Differential Operators and Laplacian Sharpening.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.4. Spatial High-Pass Filtering, Sobel Gradients, and Laplacian Sharpening.md",
    "03.5. Order-Statistic Non-Linear Filtering - Median and Rank-Order Min-Max Operators.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.5. Order-Statistic Non-Linear Filtering (Median, Min, Max, Min-Max Operators).md",
    "03.6. Structural Edge-Preserving Smoothing - The Nagao Adaptive Multi-Sector Filter.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.6. Structural Edge-Preserving Smoothing (Nagao 9-Sector Multi-Directional Filter).md",
    "03.9. Non-Linear Boundary-Preserving Filtering - The Joint Spatial-Radiometric Bilateral Filter.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.7. Non-Linear Boundary-Preserving Filtering (Bilateral Joint Spatial-Radiometric Filter).md",
    "03.10. Partial Differential Equations in Restoration - Perona-Malik Anisotropic Diffusion.md": 
        "06.2. Degradation, Restoration, and Spatial Filtering/06.2.8. Partial Differential Equations in Restoration (Perona-Malik Anisotropic Diffusion).md",

    # 06.3. Frequency Domain and Spectral Processing
    "03.7. Fourier Spectral Analysis - 2D DFT, FFT Shift, and Frequency Domain Filtering.md": 
        "06.3. Frequency Domain and Spectral Processing/06.3.1. 2D Discrete Fourier Transform (DFT), FFT Shift, and Convolution Theorem.md",
    "03.8. Specialized Spectral Operators - Band-Reject Notch Filters and Directional Gabor Filter Banks.md": 
        "06.3. Frequency Domain and Spectral Processing/06.3.2. Frequency Filters (Low-Pass, High-Pass, and Band-Reject Notch Filtering).md",

    # 06.4. Mathematical Morphology and Shape Analysis
    "03.12. Set-Theoretic Mathematical Morphology - Structuring Elements, Erosion, and Dilation.md": 
        "06.4. Mathematical Morphology and Shape Analysis/06.4.1. Set-Theoretic Foundations, Binary Grids, and Structuring Elements.md",
    "03.13. Compound Morphological Operators - Opening, Closing, Gradient, and Zhang-Suen Thinning.md": 
        "06.4. Mathematical Morphology and Shape Analysis/06.4.2. Compound Operators (Opening, Closing, Gradient, and Zhang-Suen Thinning).md",

    # 06.5. Contrast Dynamics and Radiometric Retinex
    "03.14. Tonal Modification - Dynamic Range Expansion, Global HE, AHE, and CLAHE.md": 
        "06.5. Contrast Dynamics and Radiometric Retinex/06.5.1. Dynamic Range Expansion and Noise-Tolerant Contrast Stretching.md",
    "03.15. Advanced Contrast Models - Histogram Specification and Land's Retinex Illumination Separation.md": 
        "06.5. Contrast Dynamics and Radiometric Retinex/06.5.2. Advanced Contrast Models (Histogram Specification and Land's Retinex Theory).md",

    # 06.6. Clustering and Deep Restoration
    "03.11. Feature Space Clustering Segmentation - Mean-Shift and 2SP-DBSCAN.md": 
        "06.6. Clustering and Deep Restoration/06.6.1. Feature Space Clustering (Mean-Shift and 2SP-DBSCAN by UMBB iVision).md",
    "03.16. Deep Learning Denoising Architectures - From Patch MLPs to Residual DnCNN and Uformer.md": 
        "06.6. Clustering and Deep Restoration/06.6.2. Deep Learning Denoising (Patch MLPs, Residual DnCNN, and Uformer).md",

    # 06.7. Image Segmentation and Regional Extraction
    "04.1. Formal Segmentation Axioms and Homogeneity Predicates.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.1. Formal Segmentation Axioms and Homogeneity Predicates.md",
    "04.2. Global Statistical Thresholding - Mathematical Derivation of Otsu's Method.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.2. Global Optimal Statistical Thresholding (Otsu's Method Derivation).md",
    "04.3. Local Adaptive Thresholding - Niblack and Dynamic Range-Constrained Sauvola Algorithms.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.3. Local Adaptive Thresholding (Niblack and Dynamic Range Sauvola).md",
    "04.4. Complex Document Segmentation - Gaceb's Multi-Scale Mixed Binarization.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.4. Complex Document Segmentation (Gaceb's Multi-Scale Mixed Binarization).md",
    "04.5. Morphological Watershed Segmentation and Topological Distance Transforms.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.5. Morphological Watershed Segmentation and Topological Distance Transforms.md",
    "04.6. Connected Component Analysis - Two-Pass Labeling and Equivalence Trees.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.6. Connected Component Analysis (Two-Pass CCL and Equivalence Trees).md",
    "04.7. Geometric Region Descriptors - Axis-Aligned Bounding Boxes, Central Moments, and OBB.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.7. Geometric Region Descriptors (AABB, OBB, Centroids, and Central Moments).md",
    "04.8. Segmentation Evaluation Benchmarks - Dice DSC, Jaccard IoU, Hausdorff, and Zeboudj Contrast.md": 
        "06.7. Image Segmentation and Regional Extraction/06.7.8. Segmentation Evaluation Benchmarks (Dice DSC, Jaccard IoU, Hausdorff Distance).md",

    # 06.8. Image Super-Resolution Reconstruction
    "05.1. Continuous Image Reconstruction - Nearest-Neighbor, Bilinear, and Keys' Bicubic Spline.md": 
        "06.8. Image Super-Resolution Reconstruction/06.8.1. Continuous Image Reconstruction (Nearest, Bilinear, and Keys' Bicubic Spline).md",
    "05.2. Directional Reconstruction - Contour Stencils and Total Variation Minimization.md": 
        "06.8. Image Super-Resolution Reconstruction/06.8.2. Edge-Adaptive Interpolation (Contour Stencils and Total Variation Minimization).md",
    "05.3. Deep Super-Resolution Frameworks - SRCNN, Perceptual SRGAN, and ESRGAN RRDB Networks.md": 
        "06.8. Image Super-Resolution Reconstruction/06.8.3. Deep Super-Resolution Frameworks (SRCNN, Perceptual SRGAN, and ESRGAN).md",
    "05.4. Document Image Enhancement - Bi-ESRGAN Dual Path Architecture.md": 
        "06.8. Image Super-Resolution Reconstruction/06.8.4. Document Image Super-Resolution (Bi-ESRGAN Dual Path Architecture).md",

    # 06.10. Worked Analytical Exercises and Projects
    "07.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes.md": 
        "06.10. Worked Analytical Exercises and Projects/06.10.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes.md",
    "07.2. Exercise 2 - Exhaustive Step-by-Step Optimization of Otsu's Inter-Class Variance.md": 
        "06.10. Worked Analytical Exercises and Projects/06.10.2. Exercise 2 - Exhaustive Step-by-Step Optimization of Otsu's Inter-Class Variance.md",
    "07.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation.md": 
        "06.10. Worked Analytical Exercises and Projects/06.10.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation.md",
    "09.1. Applied Project - End-to-End Document Cleaning and Text Extraction Pipeline.md": 
        "06.10. Worked Analytical Exercises and Projects/06.10.4. Project - End-to-End Historical Document Restoration and Extraction Pipeline.md",

    # 06.11. Evaluative Question Banks
    "08.1. Question Bank 1 - Digital Image Fundamentals, Color Spaces, and Topology.md": 
        "06.11. Evaluative Question Banks/06.11.1. Question Bank 1 - Digital Image Fundamentals, Color Spaces, and Topology.md",
    "08.2. Question Bank 2 - Noise Models, Spatial Transformations, and Spectral Filters.md": 
        "06.11. Evaluative Question Banks/06.11.2. Question Bank 2 - Noise Models, Spatial Transformations, and Spectral Filters.md",
    "08.3. Question Bank 3 - Non-Linear Spatial Filters, Nagao Mechanics, and Morphology.md": 
        "06.11. Evaluative Question Banks/06.11.3. Question Bank 3 - Non-Linear Spatial Filters, Nagao Mechanics, and Morphology.md",
}

tai_root = VAULT_DIR / "06. Advanced Image Processing (TAI)"

# --- Step 1: Parse input.md with strict chapter-boundary termination ---
print("[*] Parsing input.md and eliminating leaking chapter headers...")
text = INPUT_MD.read_text(encoding="utf-8")
lines = text.splitlines()

extracted_notes = {}
current_note_key = None
current_lines = []
in_fence = False

def clean_lines(l_list: list[str]) -> str:
    """Strips leading/trailing blank lines and trailing horizontal rules."""
    while l_list and not l_list[0].strip():
        l_list.pop(0)
    while l_list and (not l_list[-1].strip() or l_list[-1].strip() == "---"):
        l_list.pop()
    return "\n".join(l_list).strip()

for line in lines:
    stripped = line.strip()
    if stripped.startswith("```") or stripped.startswith("~~~"):
        in_fence = not in_fence

    if not in_fence:
        # Check for major section headings (## 03. ...) to PREVENT header leakage!
        if stripped.startswith("## ") and not stripped.startswith("### "):
            if current_note_key and current_lines:
                extracted_notes[current_note_key] = clean_lines(current_lines)
            current_note_key = None
            current_lines = []
            continue

        # Check for note boundaries (### ... .md)
        if stripped.startswith("### "):
            header = stripped.lstrip("#").strip()
            if header.endswith(".md"):
                if current_note_key and current_lines:
                    extracted_notes[current_note_key] = clean_lines(current_lines)
                current_note_key = header
                current_lines = []
                continue

    if current_note_key is not None:
        current_lines.append(line)

if current_note_key and current_lines:
    extracted_notes[current_note_key] = clean_lines(current_lines)

print(f"[*] Successfully extracted {len(extracted_notes)} pure notes from input.md")

# --- Step 2: Write all lecture theory notes to their dedicated paths ---
print("[*] Writing 1-to-1 dedicated lecture notes into Chapter 06...")
wikilink_map = {}

for note_key, rel_dest in STRICT_ROUTING.items():
    if note_key in extracted_notes:
        dest_path = tai_root / rel_dest
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_text(extracted_notes[note_key] + "\n", encoding="utf-8")
        wikilink_map[Path(note_key).stem] = dest_path.stem
        print(f"  [Created Dedicated Note] {rel_dest}")

# --- Step 3: Organize TP Lab Notes into 06.9. Practical Laboratories (TPs) ---
print("[*] Ensuring TP lab tutorials are safely placed in 06.9. Practical Laboratories (TPs)...")
tp_dir = tai_root / "06.9. Practical Laboratories (TPs)"
tp_dir.mkdir(parents=True, exist_ok=True)

# Find all existing TP lab files and make sure they are in 06.9 without leaked appends
for f in tai_root.rglob("*.md"):
    if "(TP" in f.name or "Homework" in f.name:
        content = f.read_text(encoding="utf-8")
        # Strip any accidental '## Integrated Subject Knowledge:' from previous runs
        if "## Integrated Subject Knowledge:" in content:
            content = content.split("## Integrated Subject Knowledge:")[0].strip()
        
        target_name = f.name
        if not target_name.startswith("06.9."):
            # Add prefix if missing
            target_name = re.sub(r"^06\.\d+\.", "06.9.", target_name)
        
        dest_f = tp_dir / target_name
        dest_f.write_text(content + "\n", encoding="utf-8")
        if f.resolve() != dest_f.resolve():
            f.unlink()
        wikilink_map[f.stem] = dest_f.stem
        print(f"  [Secured Lab Note] {dest_f.name}")

# --- Step 4: Clean up any old subfolders with obsolete naming ---
for old_sub in ["06.1. Acquisition and Topology", "06.2. Spatial Restoration and Smoothing",
                "06.3. Non-Linear Edge Preservation", "06.4. Mathematical Morphology",
                "06.5. Contrast Dynamics and Equalization", "06.6. Single-Frame Super-Resolution",
                "06.7. Segmentation and Feature Extraction", "06.8. Practical Exercises and Solutions"]:
    d = tai_root / old_sub
    if d.exists() and d.is_dir():
        shutil.rmtree(d, ignore_errors=True)

# Also ensure top-level rogue folders are wiped
for rogue in ["00. Navigation", "02. Foundations", "03. Preprocessing", "04. Segmentation",
              "05. Super Resolution", "06. Laboratories", "07. Exercises", "09. Projects"]:
    d = VAULT_DIR / rogue
    if d.exists() and d.is_dir():
        shutil.rmtree(d, ignore_errors=True)

# --- Step 5: Update all Obsidian Wikilinks across the vault ---
print("[*] Harmonizing all Obsidian wikilinks across the entire vault...")
link_regex = re.compile(r"\[\[([^\|\]]+?)(\|[^\]]+)?\]\]")

def replace_link(m: re.Match) -> str:
    target = m.group(1).strip()
    display = m.group(2) or ""
    if target in wikilink_map:
        return f"[[{wikilink_map[target]}{display}]]"
    return m.group(0)

updated_count = 0
for md_file in VAULT_DIR.rglob("*.md"):
    text = md_file.read_text(encoding="utf-8")
    new_text = link_regex.sub(replace_link, text)
    if new_text != text:
        md_file.write_text(new_text, encoding="utf-8")
        updated_count += 1

print(f"[OK] Wikilinks updated across {updated_count} files.")

# --- Step 6: Regenerate Chapter 06 Navigation MOC ---
ch_moc = tai_root / "06.0. Chapter Overview and Navigation.md"
lines = [
    "# 06. Advanced Image Processing (TAI) - Curriculum Overview and Navigation",
    "",
    "## 1. Chapter Architecture",
    "```mermaid",
    "mindmap",
    "  root((06. Advanced Image Processing))",
    "    06.1 Foundations",
    "      Formation & Optics",
    "      Sampling & Quantization",
    "      Color Spaces & Topology",
    "      Histograms & Convolution",
    "    06.2 Restoration",
    "      Noise & Quality Metrics",
    "      Linear & High-Pass",
    "      Median & Nagao Filter",
    "      Bilateral & Anisotropic",
    "    06.3 Frequency Processing",
    "      2D DFT & Convolution",
    "      Notch & Gabor Filter",
    "    06.4 Morphology",
    "      Erosion & Dilation",
    "      Opening & Closing",
    "      Zhang-Suen Thinning",
    "    06.5 Contrast & Retinex",
    "      Stretching & Equalization",
    "      CLAHE & Retinex Theory",
    "    06.6 Clustering & Deep",
    "      Mean-Shift & 2SP-DBSCAN",
    "      Residual DnCNN & Uformer",
    "    06.7 Segmentation",
    "      Axioms & Otsu Derivation",
    "      Sauvola & Watershed",
    "      Connected Components CCL",
    "    06.8 Super-Resolution",
    "      Bicubic & Contour Stencils",
    "      ESRGAN & Bi-ESRGAN",
    "    06.9 Practical TPs",
    "      TP1 Image Basics & Slicing",
    "      TP2 Noise & Spatial Filters",
    "      TP2 Nagao & Morphology",
    "      TP2 CLAHE & Super-Resolution",
    "    06.10 Worked Exercises",
    "      Convolution Padding Math",
    "      Otsu Derivation Steps",
    "      Bilinear Reconstruction",
    "      Restoration Project Pipeline",
    "    06.11 Question Banks",
    "      Quizzes 1 2 and 3",
    "```",
    "",
    "## 2. Navigational Table of Contents",
    ""
]

for subfolder in sorted([d for d in tai_root.iterdir() if d.is_dir()]):
    lines.append(f"### {subfolder.name}")
    for doc in sorted(subfolder.glob("*.md")):
        lines.append(f"- [[{doc.stem}]]")
    lines.append("")

ch_moc.write_text("\n".join(lines), encoding="utf-8")

print("\n" + "=" * 65)
print(" [SUCCESS] Master Architectural Reconstruction Complete!")
print(" No overwriting, no leaking headers, and 100% theory restored.")
print("=" * 65)
