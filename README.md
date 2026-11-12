# UMBB Study Vaults — Repository Hub

Academic study vaults (Obsidian) for UMBB coursework, organized as **four independent branches**.
This branch (`main`) is only the repository's landing page and central index — it intentionally
contains **no course material**. All notes, exercises, quizzes, and labs live in the dedicated
subject branches below.

## How This Repository Is Organized

| Branch | Subject | What lives there |
| :--- | :--- | :--- |
| [`image-processing-data-science`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/image-processing-data-science) | **APDS + TAI** — Image Processing and Data Science | Complete APDS & TAI curriculum in one vault |
| [`networking`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/networking) | **Réseaux** — Networking | Computer Networks course only |
| [`databases`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/databases) | **BDA** — Databases | Advanced Databases course only |

Each subject branch is a **self-contained Obsidian vault** with its own independent history.
Switch to a branch (`git switch <branch>` or the GitHub branch selector above) to browse or study
its material.

---

## 1. Image Processing and Data Science (APDS + TAI)

**Branch:** [`image-processing-data-science`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/image-processing-data-science)

One unified curriculum that combines **Data Science & Machine Learning (APDS)** with
**Advanced Image Processing & Computer Vision (TAI)** on top of a single shared Python
computational foundation:

- **APDS track** — Introduction to Data Science, Python Programming Essentials, Essential Python
  Libraries, Data Cleansing & Preprocessing, Exploratory Data Analysis (sections 01–05)
- **TAI track** — Advanced Image Processing (section 06): image foundations & discretization,
  degradation & restoration, frequency-domain processing, mathematical morphology, contrast
  dynamics & Retinex, clustering & deep restoration, segmentation, super-resolution, worked
  exercises, and the full TP laboratory series
- **Shared library core** — 26 in-depth notes on NumPy, Pandas, Matplotlib/Seaborn, OpenCV,
  SciPy, and Scikit-Learn (the `Libraries/` section)
- **Quiz banks** for every chapter and library note, plus the custom Obsidian plugin toolchain
  (`obsidian-plugins/`)

Start with `00. Master Curriculum Roadmap.md` on that branch.

## 2. Networking (Réseaux)

**Branch:** [`networking`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/networking)

The complete Computer Networks vault:

- **Sections 01–08** — Physical & Data Link Layers, IPv4 Network Layer (FLSM/VLSM/subnetting),
  IP Datagram & Fragmentation, Cisco IOS CLI Reference, IP Routing Architectures, Network
  Services & L2–L3 Interfacing (ARP, DHCP, NAT/PAT, 802.11), Routing Protocols & Algorithms
  (RIPv2, OSPF, BGP), and Transport Layer Protocols & Mechanics (UDP, TCP)
- **Section 09** — Exams & Assessments: 14 graded papers (2020–2025) with solutions and the
  exam pattern atlas
- **Chapter quiz banks** (chapters 05–08)

Start with `00. Master Index.md` on that branch.

## 3. BDA (Databases)

**Branch:** [`databases`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/databases)

The Advanced Databases module:

- Relational Model & ER Diagrams, SQL Fundamentals, Advanced SQL & Query Optimization,
  Normalization & Schema Design, Transactions/Concurrency & Recovery, and NoSQL & Modern
  Data Stores
- Quiz banks for each module

Start with `00. Databases Roadmap.md` on that branch.

---

## Ground Rules (Permanent Architecture)

- The four branches are **independent destinations**, not stages in a development workflow.
- **Never merge** a subject branch into `main`, `main` into a subject branch, or one subject
  branch into another — no merge commits, squash merges, rebase-based integration, or merging
  pull requests.
- If material must move between branches, use **file-level transfers** committed on the
  destination branch, never history merges.
- `main` stays minimal: this landing page and the central index only. No course folders, notes,
  exercises, PDFs, or notebooks belong here.
