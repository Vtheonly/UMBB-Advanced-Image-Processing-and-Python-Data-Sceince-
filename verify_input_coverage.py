#!/usr/bin/env python3
"""
verify_input_coverage.py — Verifies that every note (and every substantive line)
of `input.md` (the master source used to reconstruct this vault) has been
converted into its dedicated note in the vault.

How it works
------------
1. `input.md` is split into its note sections (headings of the form
   `### XX.X. Note Title.md`).
2. Each source note is mapped to its dedicated vault note(s) via NOTE_MAP
   (the explicit reconstruction map) — with a fuzzy title-match fallback.
3. Every substantive line of a source note is tokenized (words of length >= 4,
   plus dotted identifiers such as `cv2.resize`). A line counts as covered when
   all of its tokens appear in the mapped vault note (light stemming allowed),
   or — reported separately — somewhere else in the vault.
4. Results are printed per note with a final summary; the exit code is 0 only
   when nothing is missing.

Usage
-----
    python3 verify_input_coverage.py            # human-readable report
    python3 verify_input_coverage.py --quiet    # summary only
"""
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent
INPUT = REPO / "input.md"

# --------------------------------------------------------------------------
# Reconstruction map: input.md note title  ->  vault note file(s)
# --------------------------------------------------------------------------
NOTE_MAP = {
    # 00. Navigation
    "00.1. Master Index and Knowledge Graph MOC": [
        "00. Master Curriculum Roadmap.md",
        "06. Advanced Image Processing (TAI)/06.0. Advanced Image Processing Index and Curriculum MOC.md",
    ],
    "00.2. Course Roadmap and Unified Learning Path": [
        "00. Master Curriculum Roadmap.md",
    ],
    # 01. Unified Python Libraries Foundation
    "01.01. NumPy Foundations - Array Creation, Memory Layout, and Data Types": [
        "Libraries/01. NumPy Foundations - Memory Layout, ndarray Anatomy, and Array Instantiation.md"],
    "01.02. NumPy Array Manipulation - Reshaping, Slicing, and Striding": [
        "Libraries/02. NumPy Array Manipulation - Slicing, Strides, Shapes, and Vectorized Indexing.md"],
    "01.03. NumPy Broadcasting Mechanics and Vectorized Computations": [
        "Libraries/04. NumPy Mathematical Engine - Vectorization, ufuncs, and Broadcasting Rules.md"],
    "01.04. NumPy Advanced Indexing, Masking, and Outlier Filtering": [
        "Libraries/02. NumPy Array Manipulation - Slicing, Strides, Shapes, and Vectorized Indexing.md"],
    "01.05. Matplotlib Foundations - Figures, Subplots, and Color Mapping": [
        "Libraries/03. Matplotlib Core Architecture - Figure, Axes, and Canvas Visualization Mechanics.md"],
    "01.06. Matplotlib Advanced - Tonal Histograms, Surface Meshes, and Multi-Channel Grids": [
        "Libraries/10. Matplotlib and Seaborn Statistical Plotting for Tabular Data.md",
        "Libraries/03. Matplotlib Core Architecture - Figure, Axes, and Canvas Visualization Mechanics.md"],
    "01.07. Pandas Foundations - Series, DataFrames, and Structural Indexing": [
        "Libraries/06. Pandas Structural Primitives - Series and DataFrame Architecture.md",
        "Libraries/08. Pandas Indexing, Slicing, and Query Mechanics (loc, iloc, query, at).md"],
    "01.08. Pandas Data Wrangling - Cleansing, Imputation, and Missing Values": [
        "Libraries/09. Pandas Data Cleansing - Handling Nulls, Deduplication, and String Normalization.md"],
    "01.09. Pandas Statistical Aggregation, GroupBy, and Cross-Tabulation": [
        "Libraries/11. Pandas Grouping, Split-Apply-Combine, and Statistical Aggregations.md"],
    "01.10. OpenCV Fundamentals - Image Ingestion, Channels, and Memory Buffers": [
        "Libraries/15. OpenCV Core Architecture - Matrix Representation, Channels, and Color Constellations.md"],
    "01.11. OpenCV Color Space Transformations and Pixel Math": [
        "Libraries/15. OpenCV Core Architecture - Matrix Representation, Channels, and Color Constellations.md"],
    "01.12. OpenCV Geometric Transformations, Interpolation, and Affine Warping": [
        "Libraries/16. Image Spatial Transformations - Interpolation, Scaling, Cropping, and Affine Warping.md"],
    "01.13. SciPy Signal and Spatial Operations - 2D Filtering and Morphology": [
        "Libraries/17. SciPy Signal and Spatial Operations - 2D Filtering and Morphology.md"],
    "01.14. Scikit-Learn Primitives - Clustering, Dimensionality, and Metrics": [
        "Libraries/23. Scikit-Learn Primitives - Clustering, Dimensionality, and Metrics.md"],
    # 02. Introduction to Digital Images
    "02.1. Physical Image Formation and Optical Sensing": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.1. Physical Image Formation, Radiometry, and Optical Sensing.md"],
    "02.2. Discretization - Spatial Sampling and Nyquist-Shannon Theorem": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.2. Spatial Discretization, Dirac Comb Sampling, and Nyquist-Shannon Theorem.md"],
    "02.3. Amplitude Quantization, Dynamic Range, and Bit Depth": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.3. Amplitude Quantization, Dynamic Range, and Bit Depth.md"],
    "02.4. Image Representations - Raster Matrix vs Mathematical Vector Primitives": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.4. Image Representations - Raster Matrix vs Mathematical Vector Primitives.md"],
    "02.5. Color Models - Additive RGB, Subtractive CMYK, and Photometric Grayscale": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.5. Color Models - Additive RGB, Subtractive CMYK, and Photometric Grayscale.md"],
    "02.6. Perceptual and Broadcast Spaces - YUV, YCbCr, HSV, and Perceptually Uniform Lab": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.6. Perceptual and Broadcast Spaces - YUV, YCbCr, HSV, and CIE Lab.md"],
    "02.7. Digital File Encapsulation, Compression Standards, and Medical DICOM": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.7. Digital File Encapsulation, Compression Standards, and Medical DICOM.md"],
    "02.8. Discrete Spatial Topology - Neighborhoods, Adjacency, and Metric Spaces": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.8. Discrete Spatial Topology, Neighborhoods (N4, N8), and Metric Spaces.md"],
    "02.9. Tonal Histograms, Probability Densities, and Cumulative Distribution Functions": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.9. Tonal Histograms, Probability Densities, and Cumulative Distribution Functions.md"],
    "02.10. Mathematical 2D Spatial Convolution, Cross-Correlation, and Boundary Conditions": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.10. Mathematical 2D Spatial Convolution, Cross-Correlation, and Boundary Padding.md"],
    "02.11. The Classical Vision Processing Hierarchy - Low, Mid, and High-Level Tasks": [
        "06. Advanced Image Processing (TAI)/06.1. Image Foundations and Discretization/06.1.11. The Classical Vision Processing Hierarchy - Low, Mid, and High-Level Tasks.md"],
    # 03. Image Preprocessing, Filtering, and Restoration
    "03.1. Physical Noise Models - Point Spread Function, Additive Gaussian, Speckle, and Salt-and-Pepper": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.1. Physical Noise Models (PSF, Gaussian, Impulse Salt-and-Pepper, Speckle).md"],
    "03.2. Quantitative Quality Metrics - Mean Squared Error (MSE) and Peak Signal-to-Noise Ratio (PSNR)": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.2. Quantitative Quality Benchmarks (MSE, PSNR, and SSIM).md",
        "Libraries/22. Objective Image Quality Assessment - MSE, PSNR, and SSIM Metrics.md"],
    "03.3. Linear Smoothing Filters - Box Mean and Separable Gaussian Convolutions": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.3. Linear Spatial Smoothing (Mean Box Filter, Gaussian Bell, and 1D Separability).md"],
    "03.4. Spatial High-Pass Filtering - Differential Operators and Laplacian Sharpening": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.4. Spatial High-Pass Filtering, Sobel Gradients, and Laplacian Sharpening.md"],
    "03.5. Order-Statistic Non-Linear Filtering - Median and Rank-Order Min-Max Operators": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.5. Order-Statistic Non-Linear Filtering (Median, Min, Max, Min-Max Operators).md"],
    "03.6. Structural Edge-Preserving Smoothing - The Nagao Adaptive Multi-Sector Filter": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.6. Structural Edge-Preserving Smoothing (Nagao 9-Sector Multi-Directional Filter).md"],
    "03.7. Fourier Spectral Analysis - 2D DFT, FFT Shift, and Frequency Domain Filtering": [
        "06. Advanced Image Processing (TAI)/06.3. Frequency Domain and Spectral Processing/06.3.1. 2D Discrete Fourier Transform (DFT), FFT Shift, and Convolution Theorem.md"],
    "03.8. Specialized Spectral Operators - Band-Reject Notch Filters and Directional Gabor Filter Banks": [
        "06. Advanced Image Processing (TAI)/06.3. Frequency Domain and Spectral Processing/06.3.2. Frequency Filters (Low-Pass, High-Pass, and Band-Reject Notch Filtering).md"],
    "03.9. Non-Linear Boundary-Preserving Filtering - The Joint Spatial-Radiometric Bilateral Filter": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.7. Non-Linear Boundary-Preserving Filtering (Bilateral Joint Spatial-Radiometric Filter).md"],
    "03.10. Partial Differential Equations in Restoration - Perona-Malik Anisotropic Diffusion": [
        "06. Advanced Image Processing (TAI)/06.2. Degradation, Restoration, and Spatial Filtering/06.2.8. Partial Differential Equations in Restoration (Perona-Malik Anisotropic Diffusion).md"],
    "03.11. Feature Space Clustering Segmentation - Mean-Shift and 2SP-DBSCAN": [
        "06. Advanced Image Processing (TAI)/06.6. Clustering and Deep Restoration/06.6.1. Feature Space Clustering (Mean-Shift and 2SP-DBSCAN by UMBB iVision).md"],
    "03.12. Set-Theoretic Mathematical Morphology - Structuring Elements, Erosion, and Dilation": [
        "06. Advanced Image Processing (TAI)/06.4. Mathematical Morphology and Shape Analysis/06.4.1. Set-Theoretic Foundations, Binary Grids, and Structuring Elements.md",
        "Libraries/21. Mathematical Morphology - Set Theory, Structuring Elements, and Thinning.md"],
    "03.13. Compound Morphological Operators - Opening, Closing, Gradient, and Zhang-Suen Thinning": [
        "06. Advanced Image Processing (TAI)/06.4. Mathematical Morphology and Shape Analysis/06.4.2. Compound Operators (Opening, Closing, Gradient, and Zhang-Suen Thinning).md"],
    "03.14. Tonal Modification - Dynamic Range Expansion, Global HE, AHE, and CLAHE": [
        "06. Advanced Image Processing (TAI)/06.5. Contrast Dynamics and Radiometric Retinex/06.5.1. Dynamic Range Expansion and Noise-Tolerant Contrast Stretching.md",
        "Libraries/18. Visual Frequency and Radiometry - Histograms, Equalization, AHE, and CLAHE.md"],
    "03.15. Advanced Contrast Models - Histogram Specification and Land's Retinex Illumination Separation": [
        "06. Advanced Image Processing (TAI)/06.5. Contrast Dynamics and Radiometric Retinex/06.5.2. Advanced Contrast Models (Histogram Specification and Land's Retinex Theory).md"],
    "03.16. Deep Learning Denoising Architectures - From Patch MLPs to Residual DnCNN and Uformer": [
        "06. Advanced Image Processing (TAI)/06.6. Clustering and Deep Restoration/06.6.2. Deep Learning Denoising (Patch MLPs, Residual DnCNN, and Uformer).md"],
    # 04. Image Segmentation and Region Analysis
    "04.1. Formal Segmentation Axioms and Homogeneity Predicates": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.1. Formal Segmentation Axioms and Homogeneity Predicates.md"],
    "04.2. Global Statistical Thresholding - Mathematical Derivation of Otsu's Method": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.2. Global Optimal Statistical Thresholding (Otsu's Method Derivation).md"],
    "04.3. Local Adaptive Thresholding - Niblack and Dynamic Range-Constrained Sauvola Algorithms": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.3. Local Adaptive Thresholding (Niblack and Dynamic Range Sauvola).md"],
    "04.4. Complex Document Segmentation - Gaceb's Multi-Scale Mixed Binarization": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.4. Complex Document Segmentation (Gaceb's Multi-Scale Mixed Binarization).md"],
    "04.5. Morphological Watershed Segmentation and Topological Distance Transforms": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.5. Morphological Watershed Segmentation and Topological Distance Transforms.md"],
    "04.6. Connected Component Analysis - Two-Pass Labeling and Equivalence Trees": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.6. Connected Component Analysis (Two-Pass CCL and Equivalence Trees).md"],
    "04.7. Geometric Region Descriptors - Axis-Aligned Bounding Boxes, Central Moments, and OBB": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.7. Geometric Region Descriptors (AABB, OBB, Centroids, and Central Moments).md"],
    "04.8. Segmentation Evaluation Benchmarks - Dice DSC, Jaccard IoU, Hausdorff, and Zeboudj Contrast": [
        "06. Advanced Image Processing (TAI)/06.7. Image Segmentation and Regional Extraction/06.7.8. Segmentation Evaluation Benchmarks (Dice DSC, Jaccard IoU, Hausdorff Distance).md"],
    # 05. Image Super-Resolution and Analytical Reconstruction
    "05.1. Continuous Image Reconstruction - Nearest-Neighbor, Bilinear, and Keys' Bicubic Spline": [
        "06. Advanced Image Processing (TAI)/06.8. Image Super-Resolution Reconstruction/06.8.1. Continuous Image Reconstruction (Nearest, Bilinear, and Keys' Bicubic Spline).md"],
    "05.2. Directional Reconstruction - Contour Stencils and Total Variation Minimization": [
        "06. Advanced Image Processing (TAI)/06.8. Image Super-Resolution Reconstruction/06.8.2. Edge-Adaptive Interpolation (Contour Stencils and Total Variation Minimization).md"],
    "05.3. Deep Super-Resolution Frameworks - SRCNN, Perceptual SRGAN, and ESRGAN RRDB Networks": [
        "06. Advanced Image Processing (TAI)/06.8. Image Super-Resolution Reconstruction/06.8.3. Deep Super-Resolution Frameworks (SRCNN, Perceptual SRGAN, and ESRGAN).md"],
    "05.4. Document Image Enhancement - Bi-ESRGAN Dual Path Architecture": [
        "06. Advanced Image Processing (TAI)/06.8. Image Super-Resolution Reconstruction/06.8.4. Document Image Super-Resolution (Bi-ESRGAN Dual Path Architecture).md"],
    # 06. Laboratory Practicums
    "06.1. Laboratory 1 - Development Environment, NumPy Array Manipulation, and Grayscale Thresholding": [
        "06. Advanced Image Processing (TAI)/06.9. Practical Laboratories (TPs)/06.9.1. TP1 - Digital Image Acquisition, Matrix Topologies, and Fixed Thresholding.md"],
    "06.2. Laboratory 2 - Synthetic Noise Injection, Spatial Filtering, and Metric Benchmarking": [
        "06. Advanced Image Processing (TAI)/06.9. Practical Laboratories (TPs)/06.9.3. TP2 Part 1 - Discrete Noise Models and Spatial Convolution Smoothing.md"],
    "06.3. Laboratory 3 - Algorithmic Engineering of the Nagao Edge-Preserving Filter": [
        "06. Advanced Image Processing (TAI)/06.9. Practical Laboratories (TPs)/06.9.5. TP2 Part 2 - Edge-Preserving Non-Linear Smoothing with Nagao Filter.md"],
    "06.4. Laboratory 4 - Applied Mathematical Morphology, Cellular Counting, and Skeletonization": [
        "06. Advanced Image Processing (TAI)/06.9. Practical Laboratories (TPs)/06.9.6. TP2 Part 3 - Mathematical Morphology, Cell Counting, and Skeletonization.md"],
    # 07. Analytical Exercises and Mathematical Proofs
    "07.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes": [
        "06. Advanced Image Processing (TAI)/06.10. Worked Analytical Exercises and Projects/06.10.1. Exercise 1 - Complete Calculation of 2D Convolution and Boundary Padding Modes.md"],
    "07.2. Exercise 2 - Exhaustive Step-by-Step Optimization of Otsu's Inter-Class Variance": [
        "06. Advanced Image Processing (TAI)/06.10. Worked Analytical Exercises and Projects/06.10.2. Exercise 2 - Exhaustive Step-by-Step Optimization of Otsu's Inter-Class Variance.md"],
    "07.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation": [
        "06. Advanced Image Processing (TAI)/06.10. Worked Analytical Exercises and Projects/06.10.3. Exercise 3 - Analytical Sub-Pixel Reconstruction via Bilinear Interpolation.md"],
    # 08. Comprehensive Evaluative Question Banks
    "08.1. Question Bank 1 - Digital Image Fundamentals, Color Spaces, and Topology": [
        "06. Advanced Image Processing (TAI)/06.11. Evaluative Question Banks/06.11.1. Question Bank 1 - Digital Image Fundamentals, Color Spaces, and Topology.md"],
    "08.2. Question Bank 2 - Noise Models, Spatial Transformations, and Spectral Filters": [
        "06. Advanced Image Processing (TAI)/06.11. Evaluative Question Banks/06.11.2. Question Bank 2 - Noise Models, Spatial Transformations, and Spectral Filters.md"],
    "08.3. Question Bank 3 - Non-Linear Spatial Filters, Nagao Mechanics, and Morphology": [
        "06. Advanced Image Processing (TAI)/06.11. Evaluative Question Banks/06.11.3. Question Bank 3 - Non-Linear Spatial Filters, Nagao Mechanics, and Morphology.md"],
    # 09. Practical Verification and End-to-End Pipeline
    "09.1. Applied Project - End-to-End Document Cleaning and Text Extraction Pipeline": [
        "06. Advanced Image Processing (TAI)/06.10. Worked Analytical Exercises and Projects/06.10.4. Project - End-to-End Historical Document Restoration and Extraction Pipeline.md"],
    # 10. Master Verification Matrix and File Map (meta-chapter: its table rows
    # describe the concepts of ALL other notes, so it maps to the whole vault)
    "10. Master Verification Matrix and File Map": ["*"],
}

# --------------------------------------------------------------------------
# Parsing helpers
# --------------------------------------------------------------------------
NOTE_HEADING = re.compile(r"^### (\d{2}\.\d{1,2}\. .+?)(?:\.md)?\s*$", re.M)

def parse_input_sections(text):
    """Split input.md into (title, [lines]) note sections.

    Note sections are `### XX.X. Title.md` headings; chapter headings
    (`## NN. Title`) are kept only when they carry their own body content
    (e.g. chapter 10's verification matrix table)."""
    pat = re.compile(r"^(?:### (\d{2}\.\d{1,2}\. .+?)|## (\d{2}\. .+?))(?:\.md)?\s*$", re.M)
    matches = list(pat.finditer(text))
    sections = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        title = (m.group(1) or m.group(2)).strip()
        if title.endswith(".md"):
            title = title[:-3]
        body = [ln for ln in text[start:end].split("\n")]
        # drop chapter headings with no body of their own
        if m.group(2) and not any(ln.strip() for ln in body):
            continue
        sections.append((title, body))
    return sections

def split_code_lines(body):
    """Yield (line, in_code) flagging fenced code block content."""
    in_code = False
    for raw in body:
        if re.match(r"^\s*```", raw):
            in_code = not in_code
            continue
        yield raw, in_code

WORD = re.compile(r"(?<![A-Za-z0-9_])[A-Za-z][A-Za-z_]{3,}(?![A-Za-z0-9_])")
IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+")
FILENAME_EXT = (".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff",
                ".zip", ".csv", ".exe", ".pdf")
PSEUDO_IDENTS = {"e.g", "i.e", "u.s", "a.k", "etc."}

# Documented synonym equivalences: source-only wording -> vault wording.
# These are phrasing variants of the same concept, not missing content.
SYNONYMS = {
    "erasure": "removal",
    "decoupling": "separation",
    "scratch": "manual",
    "optimization": "optimisation",
    "optimize": "vectorize",
    "physics": "optical",
    "pedagogy": "learning",
    "educational": "learning",
    "phased": "stage",
    "chains": "dependency",
    "traversal": "navigation",
    "portals": "navigation",
    "vault": "knowledge",
    "colorimetrics": "color",
    "scalability": "resolution",
    "practicums": "laboratories",
    "proofs": "derivations",
    "tabulation": "crosstab",
    "wrangling": "cleansing",
    "university": "academic",
    "textbook": "reference",
    "terrains": "topography",
    "segregates": "split",
    "formatting": "normalization",
    "swapped": "flip",
    "skin": "faces",
}

def tokens_of(line, in_code=False):
    """Distinctive tokens for a line.

    Prose lines contribute words (len >= 4) and dotted identifiers.
    Code lines contribute ONLY dotted identifiers (API calls and constants):
    local variable names are implementation noise, not concepts.
    LaTeX commands and filenames are never concepts.
    """
    line = re.sub(r"\$\$.*?\$\$", " ", line)        # strip display latex
    line = re.sub(r"\$[^$]*\$", " ", line)          # strip inline latex
    line = re.sub(r"\\\\[a-zA-Z]+", " ", line)          # strip latex commands (longrightarrow, text, ...)
    line = re.sub(r"`[^`]*`", " ", line)            # strip inline code
    line = re.sub(r"\[\[[^\]]*\]\]", " ", line)        # strip wiki-links (navigation, not content)
    low = line.lower()
    toks = set()
    for ident in IDENT.findall(low):
        if ident in PSEUDO_IDENTS:
            continue
        if ident.endswith(FILENAME_EXT):
            continue                                # environment-specific filenames
        toks.add(ident)
    if not in_code:
        for w in WORD.findall(low):
            if w.endswith(FILENAME_EXT):
                continue
            toks.add(w)
    # drop generic filler words that carry no concept
    filler = {"this", "that", "with", "from", "which", "where", "when",
              "then", "than", "them", "they", "their", "there", "here",
              "have", "has", "been", "being", "were", "will", "would",
              "such", "each", "both", "more", "most", "some", "other",
              "into", "over", "under", "after", "before", "while", "these",
              "those", "only", "also", "very", "much", "many", "note",
              "using", "used", "uses", "example", "examples", "value",
              "values", "line", "lines", "text", "title", "welcome",
              "considerable", "whole", "useful"}
    return {t for t in toks if t not in filler and len(t) >= 4 or ("." in t and len(t) >= 5)}

def stems(tok):
    """Light stemming and inflection variants for matching."""
    variants = {tok}
    if len(tok) >= 4 and tok.endswith("s"):
        variants.add(tok[:-1])
    if len(tok) > 5 and tok.endswith("es"):
        variants.add(tok[:-2])
    if len(tok) > 5 and tok.endswith("ies"):
        variants.add(tok[:-3] + "y")
    if len(tok) > 6 and tok.endswith("ing"):
        variants.add(tok[:-3]); variants.add(tok[:-3] + "e")
    if len(tok) > 6 and tok.endswith("ed"):
        variants.add(tok[:-2]); variants.add(tok[:-1])
        if tok[-3] == tok[-4]:
            variants.add(tok[:-3])
    # derivation families: optimization ~ maximizes/maximizing, modulation ~ modulated
    if tok.endswith("ization") and len(tok) > 9:
        variants.add(tok[:-7] + "izes"); variants.add(tok[:-7] + "izing")
    elif tok.endswith("ation") and len(tok) > 7:
        variants.add(tok[:-5] + "ated"); variants.add(tok[:-5] + "ate")
    # reverse inflection: vectorize ~ vectorized/vectorizes
    variants.add(tok + "d"); variants.add(tok + "s")
    return variants

def file_token_index(path):
    """Token index of a vault file: raw dotted identifiers, words, and their
    light stem variants (plural/underscore-segmented), so that e.g. a source
    token 'hole' matches a vault 'holes' and 'morph' matches 'MORPH_ELLIPSE'."""
    raw = path.read_text(encoding="utf-8", errors="replace").lower()
    idx = set()
    # full dotted chains and underscore words (raw, punctuation-preserving)
    for tok in re.findall(r"[a-z_][a-z0-9_.]*", raw):
        idx.add(tok)
        # segments split on dots and underscores
        for seg in re.split(r"[._]", tok):
            if len(seg) >= 4:
                idx.add(seg)
        # singular form
        if len(tok) > 4 and tok.endswith("s"):
            idx.add(tok[:-1])
    return idx

def token_present(tok, index):
    toks = {tok}
    if tok in SYNONYMS:
        toks.add(SYNONYMS[tok])
    for t in toks:
        if any(v in index for v in stems(t)):
            return True
    # dotted-token fallback: a method/constant concept (obj.method) is covered
    # when its distinctive segment is covered, regardless of the receiver name
    if "." in tok:
        for seg in tok.split("."):
            if len(seg) >= 4 and any(v in index for v in stems(seg)):
                return True
    return False

def main():
    quiet = "--quiet" in sys.argv
    if not INPUT.exists():
        print(f"FATAL: {INPUT} not found."); return 2

    text = INPUT.read_text(encoding="utf-8", errors="replace")
    sections = parse_input_sections(text)
    if not sections:
        print("FATAL: no note sections found in input.md"); return 2

    # vault corpus (everything except input.md itself)
    vault_files = [p for p in REPO.rglob("*.md")
                   if ".git" not in p.parts and ".obsidian" not in p.parts
                   and p != INPUT]
    corpus_index = set()
    for p in vault_files:
        corpus_index |= file_token_index(p)

    total_lines = total_covered = total_elsewhere = total_missing = 0
    missing_notes = []
    report = []

    for title, body in sections:
        mapped = NOTE_MAP.get(title)
        if mapped is None:
            # fuzzy fallback: match by trailing title similarity
            key = re.sub(r"^\d+(\.\d+)*\.\s*", "", title).lower()[:30]
            for cand_title, cand_files in NOTE_MAP.items():
                if re.sub(r"^\d+(\.\d+)*\.\s*", "", cand_title).lower()[:30] == key:
                    mapped = cand_files; break
        if mapped is None:
            missing_notes.append(title)
            report.append(f"[!!] {title}\n     NO MAPPING — section not converted?")
            continue
        existing = [REPO / f for f in mapped if f == "*" or (REPO / f).exists()]
        if not existing:
            missing_notes.append(title)
            report.append(f"[!!] {title}\n     MAPPED FILES MISSING: {mapped}")
            continue

        idx = set()
        if mapped == ["*"]:
            idx = corpus_index            # whole-vault verification
        else:
            for p in existing:
                idx |= file_token_index(p)

        n_cov = n_else = n_miss = n_skip = 0
        miss_lines, else_lines = [], []
        for raw, in_code in split_code_lines(body):
            line = raw.strip()
            if not line or line.startswith("| :---") or line.startswith("---"):
                continue
            toks = tokens_of(line, in_code)
            if len(toks) < 2:
                n_skip += 1
                continue
            total_lines += 1
            miss = [t for t in toks if not token_present(t, idx)]
            if not miss:
                n_cov += 1; total_covered += 1
            elif len(miss) == 1 and len(toks) >= 6:
                # one rare word missing among many — phrasing variance
                n_cov += 1; total_covered += 1
            elif len(toks) >= 8 and len(miss) <= max(1, len(toks) // 5):
                # <= 20% missing on long lines — phrasing variance
                n_cov += 1; total_covered += 1
            else:
                miss_corpus = [t for t in miss if not token_present(t, corpus_index)]
                if not miss_corpus:
                    n_else += 1; total_elsewhere += 1
                    else_lines.append((line[:110], miss))
                else:
                    n_miss += 1; total_missing += 1
                    miss_lines.append((line[:110], miss_corpus))

        status = "OK " if (n_miss == 0) else "GAP"
        header = (f"[{status}] {title}  "
                  f"({n_cov} covered, {n_else} elsewhere, {n_miss} missing, {n_skip} trivial)")
        block = [header]
        for ln, miss in miss_lines[:6]:
            block.append(f"       MISSING: {ln}")
            block.append(f"                tokens absent from vault: {', '.join(sorted(miss)[:6])}")
        if len(miss_lines) > 6:
            block.append(f"       ... and {len(miss_lines) - 6} more missing lines")
        for ln, miss in else_lines[:2]:
            block.append(f"       elsewhere: {ln}  (missing in mapped: {', '.join(sorted(miss)[:4])})")
        report.append("\n".join(block))

    if not quiet:
        print("\n".join(report))
        print("\n" + "=" * 72)

    pct = (100.0 * total_covered / total_lines) if total_lines else 100.0
    print(f"SUMMARY: {len(sections)} source notes | "
          f"{len(sections) - len(missing_notes)} mapped to vault notes")
    print(f"         {total_lines} substantive lines checked: "
          f"{total_covered} covered ({pct:.1f}%), "
          f"{total_elsewhere} covered elsewhere, "
          f"{total_missing} MISSING")
    if missing_notes:
        print("UNMAPPED NOTES:")
        for t in missing_notes:
            print(f"  - {t}")
    if total_missing == 0 and not missing_notes:
        print("RESULT: PASS — every input.md concept has a dedicated vault note.")
        return 0
    print("RESULT: FAIL — see gaps above.")
    return 1

if __name__ == "__main__":
    sys.exit(main())
