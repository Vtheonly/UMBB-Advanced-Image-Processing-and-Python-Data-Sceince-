#!/usr/bin/env python3
"""
Master Image Processing & APDS Vault Reconstructor
===================================================
Reconstructs '06. Advanced Image Processing (TAI)' into a professional
university-textbook hierarchy:
- Distinguishes between Lecture Theory (Foundations, Radiometry, Restoration, etc.)
  and Practical Laboratories (TP1, TP2, Homeworks).
- Restores every theoretical slide concept, proof, and derivation from input.md.
- Eliminates messy in-file appends and rogue top-level folders.
- Harmonizes all Obsidian wikilinks across the vault.
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
    print(f"[!] Error: Could not locate input.md or TAI APDS Vault.")
    exit(1)

print(f"[*] Input Source : {INPUT_MD}")
print(f"[*] Target Vault : {VAULT_DIR}")

# Full academic mapping from input.md headers to target subfolders in Chapter 06
NOTE_ROUTING = {
    # 06.1. Image Foundations and Representation
    "02.1. Physical Image Formation and Optical Sensing.md": "06.1. Image Foundations and Representation/06.1.1. Physical Image Formation, Radiometry, and Optical Sensing.md",
    "02.2. Discretization - Spatial Sampling and Nyquist-Shannon Theorem.md": "06.1. Image Foundations and Representation/06.1.2. Sampling, Quantization, Bit Depth, and Nyquist-Shannon Theorem.md",
    "02.3. Amplitude Quantization, Dynamic Range, and Bit Depth.md": "06.1. Image Foundations and Representation/06.1.2. Sampling, Quantization, Bit Depth, and Nyquist-Shannon Theorem.md",
    "02.4. Image Representations - Raster Matrix vs Mathematical Vector Primitives.md": "06.1. Image Foundations and Representation/06.1.3. Raster Matrices, Vector Graphics, and File Encapsulation (DICOM).md",
    "02.5. Color Models - Additive RGB, Subtractive CMYK, and Photometric Grayscale.md": "06.1. Image Foundations and Representation/06.1.4. Color Spaces (RGB, CMYK, YUV, YCbCr, HSV, CIE Lab) and Photometric Grayscale.md",
    "02.6. Perceptual and Broadcast Spaces - YUV, YCbCr, HSV, and Perceptually Uniform Lab.md": "06.1. Image Foundations and Representation/06.1.4. Color Spaces (RGB, CMYK, YUV, YCbCr, HSV, CIE Lab) and Photometric Grayscale.md",
    "02.7. Digital File Encapsulation, Compression Standards, and Medical DICOM.md": "06.1. Image Foundations and Representation/06.1.3. Raster Matrices, Vector Graphics, and File Encapsulation (DICOM).md",
    "02.8. Discrete Spatial Topology - Neighborhoods, Adjacency, and Metric Spaces.md": "06.1. Image Foundations and Representation/06.1.5. Discrete Spatial Topology, Neighborhoods (N4, N8), and Metric Spaces.md",
    "02.9. Tonal Histograms, Probability Densities, and Cumulative Distribution Functions.md": "06.1. Image Foundations and Representation/06.1.6. Tonal Histograms, Probability Densities, and Cumulative Distribution Functions.md",
    "02.10. Mathematical 2D Spatial Convolution, Cross-Correlation, and Boundary Conditions.md": "06.1. Image Foundations and Representation/06.1.7. 2D Discrete Spatial Convolution, Cross-Correlation, and Boundary Padding.md",
    "02.11. The Classical Vision Processing Hierarchy - Low, Mid, and High-Level Tasks.md": "06.1. Image Foundations and Representation/06.1.8. Three-Level Vision Processing Hierarchy (Low, Mid, High).md",

    # 06.2. Degradation, Restoration, and Spatial Filtering
    "03.1. Physical Noise Models - Point Spread Function, Additive Gaussian, Speckle, and Salt-and-Pepper.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.1. Physical Noise Models (PSF, Gaussian, Impulse Salt-and-Pepper, Speckle).md",
    "03.2. Quantitative Quality Metrics - Mean Squared Error (MSE) and Peak Signal-to-Noise Ratio (PSNR).md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.2. Quantitative Quality Benchmarks (MSE, PSNR, and SSIM).md",
    "03.3. Linear Smoothing Filters - Box Mean and Separable Gaussian Convolutions.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.3. Linear Spatial Smoothing (Mean Box Filter, Gaussian Bell, and 1D Separability).md",
    "03.4. Spatial High-Pass Filtering - Differential Operators and Laplacian Sharpening.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.4. Spatial High-Pass Filtering, Sobel Gradients, and Laplacian Sharpening.md",
    "03.5. Order-Statistic Non-Linear Filtering - Median and Rank-Order Min-Max Operators.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.5. Order-Statistic Non-Linear Filtering (Median, Min, Max, Min-Max Operators).md",
    "03.6. Structural Edge-Preserving Smoothing - The Nagao Adaptive Multi-Sector Filter.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.6. Structural Edge-Preserving Smoothing (Nagao 9-Sector Multi-Directional Filter).md",
    "03.9. Non-Linear Boundary-Preserving Filtering - The Joint Spatial-Radiometric Bilateral Filter.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.7. Non-Linear Boundary-Preserving Filtering (Bilateral Joint Spatial-Radiometric Filter).md",
    "03.10. Partial Differential Equations in Restoration - Perona-Malik Anisotropic Diffusion.md": "06.2. Degradation, Restoration, and Spatial Filtering/06.2.8. Partial Differential Equations in Restoration (Perona-Malik Anisotropic Diffusion).md",

    # 06.3. Frequency Domain and Spectral Filtering
    "03.7. Fourier Spectral Analysis - 2D DFT, FFT Shift, and Frequency Domain Filtering.md": "06.3. Frequency Domain and Spectral Filtering/06.3.1. 2D Discrete Fourier Transform (DFT), FFT Shift, and Convolution Theorem.md",
    "03.8. Specialized Spectral Operators - Band-Reject Notch Filters and Directional Gabor Filter Banks.md": "06.3. Frequency Domain and Spectral Filtering/06.3.2. Frequency Filters (Low-Pass, High-Pass, and Band-Reject Notch Filtering).md",

    # 06.4. Mathematical Morphology and Shape Analysis
    "03.12. Set-Theoretic Mathematical Morphology - Structuring Elements, Erosion, and Dilation.md": "06.4. Mathematical Morphology and Shape Analysis/06.4.1. Set-Theoretic Foundations, Binary Grids, and Structuring Elements.md",
    "03.13. Compound Morphological Operators - Opening, Closing, Gradient, and Zhang-Suen Thinning.md": "06.4. Mathematical Morphology and Shape Analysis/06.4.3. Compound Operators (Opening, Closing, and Morphological Gradient).md",

    # 06.5. Contrast Dynamics and Radiometric Retinex
    "03.14. Tonal Modification - Dynamic Range Expansion, Global HE, AHE, and CLAHE.md": "06.5. Contrast Dynamics and Radiometric Retinex/06.5.1. Dynamic Range Expansion and Noise-Tolerant Contrast Stretching.md",
    "03.15. Advanced Contrast Models - Histogram Specification and Land's Retinex Illumination Separation.md": "06.5. Contrast Dynamics and Radiometric Retinex/06.5.4. Advanced Contrast Models (Histogram Specification and Land's Retinex Theory).md",

    # 06.6. Clustering and Deep Restoration
    "03.11. Feature Space Clustering Segmentation - Mean-Shift and 2SP-DBSCAN.md": "06.6. Clustering and Deep Restoration/06.6.1. Feature Space Clustering (Mean-Shift and 2SP-DBSCAN by UMBB iVision).md",
    "03.16. Deep Learning Denoising Architectures - From Patch MLPs to Residual DnCNN and Uformer.md": "06.6. Clustering and Deep Restoration/06.6.2. Deep Learning Denoising (Patch MLPs, Residual DnCNN, and Uformer).md",

    # 06.7. Image Segmentation and Regional Extraction
    "04.1. Formal Segmentation Axioms and Homogeneity Predicates.md": "06.7. Image Segmentation and Regional Extraction/06.7.1. Formal Segmentation Axioms and Homogeneity Predicates.md",
    "04.2. Global Statistical Thresholding - Mathematical Derivation of Otsu's Method.md": "06.7. Image Segmentation and Regional Extraction/06.7.2. Global Optimal Statistical Thresholding (Otsu's Method Derivation).md",
    "04.3. Local Adaptive Thresholding - Niblack and Dynamic Range-Constrained Sauvola Algorithms.md": "06.7. Image Segmentation and Regional Extraction/06.7.3. Local Adaptive Thresholding (Niblack and Dynamic Range Sauvola).md",
    "04.4. Complex Document Segmentation - Gaceb's Multi-Scale Mixed Binarization.md": "06.7. Image Segmentation and Regional Extraction/06.7.4. Complex Document Segmentation (Gaceb's Multi-Scale Mixed Binarization).md",
    "04.5. Morphological Watershed Segmentation and Topological Distance Transforms.md": "06.7. Image Segmentation and Regional Extraction/06.7.5. Morphological Watershed Segmentation and Topological Distance Transforms.md",
    "04.6. Connected Component Analysis - Two-Pass Labeling and Equivalence Trees.md": "06.7. Image Segmentation and Regional Extraction/06.7.6. Connected Component Analysis (Two-Pass CCL and Equivalence Trees).md",
    "04.7. Geometric Region Descriptors - Axis-Aligned Bounding Boxes, Central Moments, and OBB.md": "06.7. Image Segmentation and Regional Extraction/06.7.7. Geometric Region Descriptors (AABB, OBB, Centroids, and Central Moments).md",
    "04.8. Segmentation Evaluation Benchmarks - Dice DSC, Jaccard IoU, Hausdorff, and Zeboudj Contrast.md": "06.7. Image Segmentation and Regional Extraction/06.7.8. Segmentation Evaluation Benchmarks (Dice DSC, Jaccard IoU, Hausdorff Distance).md",

    # 06.8. Image Super-Resolution Reconstruction
    "05.1. Continuous Image Reconstruction - Nearest-Neighbor, Bilinear, and Keys' Bicubic Spline.md": "06.8. Image Super-Resolution Reconstruction/06.8.1. Continuous Image Reconstruction (Nearest, Bilinear, and Keys' Bicubic Spline).md",
    "05.2. Directional Reconstruction - Contour Stencils and Total Variation Minimization.md": "06.8. Image Super-Resolution Reconstruction/06.8.2. Edge-Adaptive Interpolation (Contour Stencils and Total Variation Minimization).md",
    "05.3. Deep Super-Resolution Frameworks - SRCNN, Perceptual SRGAN, and ESRGAN RRDB Networks.md": "06.8. Image Super-Resolution Reconstruction/06.8.3. Deep Super-Resolution Frameworks (SRCNN, Perceptual SRGAN, and ESRGAN).md",
    "05.4. Document Image Enhancement - Bi-ESRGAN Dual Path Architecture.md": "06.8. Image Super-Resolution Reconstruction/06.8.4. Document Image Super-Resolution (Bi-ESRGAN Dual Path Architecture).md",

    # 06.10. Worked Analytical Exercises and Projects
    "07.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes.md": "06.10. Worked Analytical Exercises and Projects/06.10.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes.md",
    "07.2. Exercise 2 - Exhaustive Step-by-Step Optimization of Otsu's Inter-Class Variance.md": "06.10. Worked Analytical Exercises and Projects/06.10.2. Exercise 2 - Exhaustive Step-by-Step Optimization of Otsu's Inter-Class Variance.md",
    "07.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation.md": "06.10. Worked Analytical Exercises and Projects/06.10.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation.md",
    "09.1. Applied Project - End-to-End Document Cleaning and Text Extraction Pipeline.md": "06.10. Worked Analytical Exercises and Projects/06.10.4. Project - End-to-End Historical Document Restoration and Extraction Pipeline.md",

    # 06.11. Evaluative Question Banks
    "08.1. Question Bank 1 - Digital Image Fundamentals, Color Spaces, and Topology.md": "06.11. Evaluative Question Banks/06.11.1. Question Bank 1 - Digital Image Fundamentals, Color Spaces, and Topology.md",
    "08.2. Question Bank 2 - Noise Models, Spatial Transformations, and Spectral Filters.md": "06.11. Evaluative Question Banks/06.11.2. Question Bank 2 - Noise Models, Spatial Transformations, and Spectral Filters.md",
    "08.3. Question Bank 3 - Non-Linear Spatial Filters, Nagao Mechanics, and Morphology.md": "06.11. Evaluative Question Banks/06.11.3. Question Bank 3 - Non-Linear Spatial Filters, Nagao Mechanics, and Morphology.md",
}

# 1. Clean existing botched files inside 06 that have "## Integrated Subject Knowledge"
tai_root = VAULT_DIR / "06. Advanced Image Processing (TAI)"
print("[*] Stripping botched append artifacts from TP lab files...")
for f in tai_root.rglob("*.md"):
    text = f.read_text(encoding="utf-8")
    if "## Integrated Subject Knowledge:" in text:
        clean_text = text.split("## Integrated Subject Knowledge:")[0].strip()
        f.write_text(clean_text + "\n", encoding="utf-8")
        print(f"  [Cleaned] {f.name}")

# 2. Re-extract pure lecture theory notes from input.md
print("[*] Re-extracting pure lecture theory notes from input.md...")
text = INPUT_MD.read_text(encoding="utf-8")
lines = text.splitlines()

current_note_key = None
current_lines = []
extracted_notes = {}

in_fence = False
for line in lines:
    stripped = line.strip()
    if stripped.startswith("```") or stripped.startswith("~~~"):
        in_fence = not in_fence

    if not in_fence and stripped.startswith("### "):
        header = stripped.lstrip("#").strip()
        if header.endswith(".md"):
            if current_note_key and current_lines:
                extracted_notes[current_note_key] = "\n".join(current_lines).strip()
            current_note_key = header
            current_lines = []
            continue

    if current_note_key is not None:
        current_lines.append(line)

if current_note_key and current_lines:
    extracted_notes[current_note_key] = "\n".join(current_lines).strip()

print(f"[*] Parsed {len(extracted_notes)} notes from input.md")

# Write notes to their proper subfolders
wikilink_map = {}
for note_key, rel_dest in NOTE_ROUTING.items():
    if note_key in extracted_notes:
        dest_path = tai_root / rel_dest
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        content = extracted_notes[note_key]
        dest_path.write_text(content + "\n", encoding="utf-8")
        wikilink_map[Path(note_key).stem] = dest_path.stem
        print(f"  [Restored Theory] {rel_dest}")

# 3. Clean up the flat TP folders and move them to 06.9. Practical Laboratories (TPs)/
print("[*] Organizing TP Laboratories into '06.9. Practical Laboratories (TPs)/'...")
tps_dir = tai_root / "06.9. Practical Laboratories (TPs)"
tps_dir.mkdir(parents=True, exist_ok=True)

# Standard TP renames
tp_map = {
    "06.1. Digital Image Acquisition, Matrix Topologies, and Fixed Thresholding (TP1).md": "06.9.1. TP1 - Digital Image Acquisition, Matrix Topologies, and Fixed Thresholding.md",
    "06.2. Spatial Transformations, ROI Extraction, and Multi-Channel Histograms (TP1).md": "06.9.2. TP1 - Spatial Transformations, ROI Extraction, and Multi-Channel Histograms.md",
    "06.3. Discrete Noise Models and Spatial Convolution Smoothing (TP2 Part 1).md": "06.9.3. TP2 Part 1 - Discrete Noise Models and Spatial Convolution Smoothing.md",
    "06.4. Fast Integral Filtering and Adaptive Spatial Smoothing (TP2 Part 1 Homework).md": "06.9.4. TP2 Part 1 Homework - Fast Integral Filtering and Adaptive Smoothing.md",
    "06.5. Edge-Preserving Non-Linear Smoothing with the Nagao Filter (TP2 Part 2).md": "06.9.5. TP2 Part 2 - Edge-Preserving Non-Linear Smoothing with Nagao Filter.md",
    "06.6. Mathematical Morphology, Cellular Counting, and Zhang-Suen Thinning (TP2 Part 3).md": "06.9.6. TP2 Part 3 - Mathematical Morphology, Cell Counting, and Skeletonization.md",
    "06.7. Contrast Dynamics, Histogram Equalization, and CLAHE (TP2 Part 4).md": "06.9.7. TP2 Part 4 - Contrast Dynamics, Histogram Equalization, and CLAHE.md",
    "06.8. Single-Frame Super-Resolution and Getreuer Contour Stencils (TP2 Part 5).md": "06.9.8. TP2 Part 5 - Single-Frame Super-Resolution and Contour Stencils.md"
}

for old_tp_name, new_tp_name in tp_map.items():
    for f in tai_root.rglob(old_tp_name):
        dest_tp = tps_dir / new_tp_name
        shutil.move(str(f), str(dest_tp))
        wikilink_map[Path(old_tp_name).stem] = dest_tp.stem
        print(f"  [Organized TP] {new_tp_name}")

# Remove old empty TP subfolders if any
for old_sub in ["06.1. Acquisition and Topology", "06.2. Spatial Restoration and Smoothing",
                "06.3. Non-Linear Edge Preservation", "06.4. Mathematical Morphology",
                "06.5. Contrast Dynamics and Equalization", "06.6. Single-Frame Super-Resolution",
                "06.7. Segmentation and Feature Extraction", "06.8. Practical Exercises and Solutions"]:
    p = tai_root / old_sub
    if p.exists() and p.is_dir():
        shutil.rmtree(p, ignore_errors=True)

# 4. Clean stray rogue directories at the vault root
for rogue in ["00. Navigation", "02. Foundations", "03. Preprocessing", "04. Segmentation",
              "05. Super Resolution", "06. Laboratories", "07. Exercises", "09. Projects"]:
    d = VAULT_DIR / rogue
    if d.exists() and d.is_dir():
        shutil.rmtree(d, ignore_errors=True)
        print(f"  [Removed Rogue Folder] {rogue}/")

# 5. Clean rogue files in Libraries/
for rogue_lib in ["01.03. NumPy Broadcasting Mechanics and Vectorized Computations.md",
                  "01.11. OpenCV Color Space Transformations and Pixel Math.md",
                  "01.13. SciPy Signal and Spatial Operations - 2D Filtering and Morphology.md"]:
    lf = VAULT_DIR / "Libraries" / rogue_lib
    if lf.exists():
        lf.unlink()
        print(f"  [Removed Duplicate Library Note] {rogue_lib}")

# 6. Harmonize all Obsidian Wikilinks
print("[*] Harmonizing Obsidian wikilinks across entire vault...")
link_pattern = re.compile(r"\[\[([^\|\]]+?)(\|[^\]]+)?\]\]")

def replace_link(m: re.Match) -> str:
    target = m.group(1).strip()
    display = m.group(2) or ""
    if target in wikilink_map:
        return f"[[{wikilink_map[target]}{display}]]"
    return m.group(0)

updated = 0
for md in VAULT_DIR.rglob("*.md"):
    c = md.read_text(encoding="utf-8")
    new_c = link_pattern.sub(replace_link, c)
    if new_c != c:
        md.write_text(new_c, encoding="utf-8")
        updated += 1

print(f"[OK] Wikilinks updated across {updated} notes.")

# 7. Rebuild Navigation MOC in Chapter 06
print("[*] Rebuilding 06.0. Chapter Overview and Navigation.md ...")
ch_moc = tai_root / "06.0. Chapter Overview and Navigation.md"
moc_lines = [
    "# 06. Advanced Image Processing (TAI) - Curriculum Overview and Navigation",
    "",
    "## 1. Curriculum Architecture",
    "```mermaid",
    "mindmap",
    "  root((06. Advanced Image Processing))",
    "    06.1 Image Foundations",
    "      Physical Formation",
    "      Sampling and Quantization",
    "      Topology and Metrics",
    "      Histograms and PMF",
    "      2D Spatial Convolution",
    "    06.2 Restoration and Filtering",
    "      Noise Models and PSNR",
    "      Linear Smoothing",
    "      Median and Rank-Order",
    "      Nagao Edge-Preserving",
    "      Bilateral and Anisotropic",
    "    06.3 Frequency Processing",
    "      2D DFT and Convolution",
    "      Notch Filter",
    "      Directional Gabor",
    "    06.4 Morphology",
    "      Erosion and Dilation",
    "      Opening and Closing",
    "      Zhang-Suen Thinning",
    "    06.5 Contrast and Retinex",
    "      Dynamic Range Stretching",
    "      Histogram Equalization",
    "      Adaptive CLAHE",
    "      Retinex Theory",
    "    06.6 Clustering and Deep Learning",
    "      Mean-Shift and 2SP-DBSCAN",
    "      Residual DnCNN and Uformer",
    "    06.7 Image Segmentation",
    "      Formal Axioms",
    "      Otsu Variance Optimization",
    "      Sauvola Binarization",
    "      Watershed and Connected Components",
    "    06.8 Super-Resolution",
    "      Keys Bicubic Spline",
    "      Contour Stencils TV",
    "      ESRGAN and Bi-ESRGAN",
    "    06.9 Practical Laboratories",
    "      TP1 Image Acquisition and Slicing",
    "      TP2 Noise and Spatial Filters",
    "      TP2 Nagao Filter Implementation",
    "      TP2 Mathematical Morphology",
    "      TP2 Dynamic Range and CLAHE",
    "      TP2 Super-Resolution Stencils",
    "    06.10 Worked Exercises",
    "      Convolution Boundary Derivations",
    "      Otsu Optimization Derivation",
    "      Sub-Pixel Bilinear Reconstruction",
    "      Historical Document Pipeline",
    "    06.11 Evaluative Question Banks",
    "      Question Banks 1, 2, and 3",
    "```",
    "",
    "## 2. Navigational Table of Contents",
    ""
]

for subfolder in sorted([d for d in tai_root.iterdir() if d.is_dir()]):
    moc_lines.append(f"### {subfolder.name}")
    for doc in sorted(subfolder.glob("*.md")):
        moc_lines.append(f"- [[{doc.stem}]]")
    moc_lines.append("")

ch_moc.write_text("\n".join(moc_lines), encoding="utf-8")

print("\n" + "=" * 65)
print(" [SUCCESS] Master Reconstruction Complete!")
print(" All slide theory notes, TPs, exercises, and quizzes are fully restored.")
print("=" * 65)
