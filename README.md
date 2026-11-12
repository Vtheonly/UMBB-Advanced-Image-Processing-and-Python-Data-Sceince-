# UMBB Study Vaults — Repository Hub

Academic study vaults (Obsidian) for UMBB coursework. This branch (`main`) hosts the
**complete APDS + TAI vault** (merged from `image-processing-data-science` via PR #1) plus
this landing page. The other subjects stay on their own dedicated branches.

## How This Repository Is Organized

| Location | Subject | What lives there |
| :--- | :--- | :--- |
| `main` (this branch) | **APDS + TAI** — Image Processing and Data Science | Complete APDS & TAI curriculum in one vault |
| [`networking`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/networking) | **Réseaux** — Networking | Computer Networks course only |
| [`databases`](https://github.com/Vtheonly/UMBB-Advanced-Image-Processing-and-Python-Data-Sceince-/tree/databases) | **BDA** — Databases | Advanced Databases course only |

`main` and each subject branch are **self-contained Obsidian vaults**. The
`image-processing-data-science` branch served as the development branch for the APDS + TAI
vault; its history and final state are now part of `main` (PR #1). The branch can be kept
as an archive or deleted.

---

## 1. Image Processing and Data Science (APDS + TAI) — on `main`

One unified curriculum that combines **Data Science & Machine Learning (APDS)** with
**Advanced Image Processing & Computer Vision (TAI)** on top of a single shared Python
computational foundation:

- **Data Science track** (`Data Science/`, chapters 01–05) — Introduction to Data Science,
  Python Programming Essentials, Essential Python Libraries, Data Cleansing & Preprocessing,
  Exploratory Data Analysis
- **TAI track** (`TAI/`, chapters 00–10) — image foundations & discretization, degradation &
  restoration, frequency-domain processing, mathematical morphology, contrast dynamics &
  Retinex, clustering & deep restoration, segmentation, super-resolution, worked exercises,
  and the full TP laboratory series
- **Shared library core** (`Libraries/`) — 26 in-depth notes on NumPy, Pandas,
  Matplotlib/Seaborn, OpenCV, SciPy, and Scikit-Learn, each with a `.5` exam-defense
  companion note, plus the 60-Second Recovery Sheet & 15-Minute Motor Recall Protocol
- **Quiz banks** (`Quiz/`) — one bank for every Data Science chapter, every TAI chapter
  (`Quiz/TAI/`), and every library note (`Quiz/Libraries/`)
- **Plugin toolchain** (`.obsidian/plugins/focus-read-suite/`) — Focus Read Suite v2.0.0, the
  single consolidated plugin (focus timer, reading ruler, typography, note heatmap), enabled
  via `.obsidian/community-plugins.json`

Start with `00. Master Curriculum Roadmap.md`.

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

- `main` is the home of the **APDS + TAI vault** plus this landing page; `networking` and
  `databases` are **independent destinations**, not stages in a development workflow.
- **Never merge** `networking` or `databases` into `main`, `main` into them, or one into the
  other — no merge commits, squash merges, rebase-based integration, or merging pull requests.
- If material must move between those branches, use **file-level transfers** committed on the
  destination branch, never history merges.
- No course material other than APDS + TAI belongs on `main`; conversely, `main` carries the
  full APDS + TAI vault, not just an index.
