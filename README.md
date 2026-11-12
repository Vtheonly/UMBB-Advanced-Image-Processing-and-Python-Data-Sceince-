# UMBB Master 1

Obsidian study vaults for **UMBB Master 1** coursework — one subject per branch.

## Where everything lives

| Branch | Subject | What it holds |
| :--- | :--- | :--- |
| `main` (this branch) | **APDS + TAI** — Image Processing and Data Science | The complete vault: notes, labs, quizzes, plugin toolchain |
| [`networking`](https://github.com/Vtheonly/UMBB-Master-1/tree/networking) | **Réseaux** — Networking | Computer Networks course |
| [`databases`](https://github.com/Vtheonly/UMBB-Master-1/tree/databases) | **BDA** — Databases | Advanced Databases course |

Every branch is a **self-contained Obsidian vault**. Clone the branch you need
(or use GitHub's branch selector) and open its folder as a vault in Obsidian:

```bash
git clone --branch <branch> --single-branch https://github.com/Vtheonly/UMBB-Master-1.git
```

---

## 1. Image Processing and Data Science (APDS + TAI) — on `main`

One unified curriculum combining **Data Science & Machine Learning (APDS)** with
**Advanced Image Processing & Computer Vision (TAI)** on a single shared Python
computational foundation:

- **Data Science track** (`Data Science/`, chapters 01–05) — Introduction to Data
  Science, Python Programming Essentials, Essential Python Libraries, Data
  Cleansing & Preprocessing, Exploratory Data Analysis
- **Image Processing track** (`Image Processing/`, chapters 00–10) — image
  foundations & discretization, degradation & restoration, frequency-domain
  processing, mathematical morphology, contrast dynamics & Retinex, clustering &
  deep restoration, segmentation, super-resolution, worked exercises, and the full
  TP laboratory series
- **Shared library core** (`Libraries/`) — 26 in-depth notes on NumPy, Pandas,
  Matplotlib/Seaborn, OpenCV, SciPy, and Scikit-Learn, each paired with a `.5`
  exam-defense companion note, plus the 60-Second Recovery Sheet & 15-Minute
  Motor Recall Protocol
- **Quiz banks** (`Quiz/`) — one bank per Data Science chapter, per Image
  Processing chapter (`Quiz/TAI/`), and per library note (`Quiz/Libraries/`)
- **Plugin toolchain** (`.obsidian/plugins/focus-read-suite/`) — Focus Read Suite
  v2.0.0, the single consolidated plugin (focus timer, reading ruler, typography,
  note heatmap), enabled via `.obsidian/community-plugins.json`

Start with `00. Master Curriculum Roadmap.md`.

## 2. Networking (Réseaux) — [`networking`](https://github.com/Vtheonly/UMBB-Master-1/tree/networking)

The complete Computer Networks vault:

- **Sections 01–08** — Physical & Data Link Layers, IPv4 Network Layer
  (FLSM/VLSM/subnetting), IP Datagram & Fragmentation, Cisco IOS CLI Reference,
  IP Routing Architectures, Network Services & L2–L3 Interfacing (ARP, DHCP,
  NAT/PAT, 802.11), Routing Protocols & Algorithms (RIPv2, OSPF, BGP), and
  Transport Layer Protocols & Mechanics (UDP, TCP)
- **Section 09** — Exams & Assessments: 14 graded papers (2020–2025) with
  solutions and the exam pattern atlas
- **Chapter quiz banks** (chapters 05–08)

Start with `00. Master Index.md` on that branch.

## 3. BDA (Databases) — [`databases`](https://github.com/Vtheonly/UMBB-Master-1/tree/databases)

The Advanced Databases module:

- Relational Model & ER Diagrams, SQL Fundamentals, Advanced SQL & Query
  Optimization, Normalization & Schema Design, Transactions/Concurrency &
  Recovery, and NoSQL & Modern Data Stores
- Quiz banks for each module

Start with `00. Databases Roadmap.md` on that branch.

---

## Ground Rules (Permanent Architecture)

- `main` is the home of the **APDS + TAI vault** plus this landing page.
  `networking` and `databases` are **independent destinations**, not stages in a
  development workflow.
- **Never merge** `networking` or `databases` into `main`, `main` into them, or
  one into the other — no merge commits, squash merges, rebase-based integration,
  or merging pull requests.
- If material must move between those branches, use **file-level transfers**
  committed on the destination branch, never history merges.
- No course material other than APDS + TAI belongs on `main`.
