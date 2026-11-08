/**
 * Focus Read Suite — the vertical attention-profile renderer.
 *
 * Visualization (redesigned):
 *   ▏                                    ▏ ← track (rounded, faint)
 *   ▏ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ▏ ← intensity texture (per bucket)
 *   ▏ ░░░░░░░▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░ ▏ ← profile area + outline (accent)
 *   ▏ ░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░ ▏
 *   ▏ ────────────────── viewport ──── ▏ ← current scroll position band
 *   ▏ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ▏
 *
 * Kept fixes from the audited rewrite:
 * - the scroller element is only re-resolved when actually detached
 *   (mode switch / layout change), not on every paint/tick/hover;
 * - on touch devices the strip is pointer-events:none (via a body class) —
 *   a 16px touch-swallowing strip on the right edge was a major mobile bug;
 * - tooltip content uses read-only record lookups (hovering never creates
 *   records);
 * - canvas DPR handling consolidated; accent parsed once per paint;
 * - destroy() restores the inline `position` it added to the view.
 */

import { MarkdownView } from "obsidian";
import { logger } from "../../core/logger";
import { HeatmapDatabase } from "./storage";
import { HeatmapSettings } from "../../core/settings-schema";

export const TOUCH_BODY_CLASS = "frs-touch-device";
export const HEATMAP_TOOLTIP_ID = "frs-heatmap-tooltip";

export class HeatmapRenderer {
  private view: MarkdownView;
  private database: HeatmapDatabase;
  private getSettings: () => HeatmapSettings;

  container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tooltip: HTMLElement | null = null;

  scrollerElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;

  /** Original inline position of contentEl (restored on destroy). */
  private originalContentElPosition: string | null = null;

  constructor(
    view: MarkdownView,
    database: HeatmapDatabase,
    getSettings: () => HeatmapSettings,
    private registerDomElement: (el: any, type: string, cb: (e: any) => void, options?: any) => void
  ) {
    this.view = view;
    this.database = database;
    this.getSettings = getSettings;

    this.initDOM();
    this.scrollerElement = this.findScroller();
    this.bindEvents();
    this.resizeCanvas();
  }

  /* ------------------------------------------------------------------ */
  /* Scroller resolution                                                 */
  /* ------------------------------------------------------------------ */

  private findScroller(): HTMLElement | null {
    const container = this.view?.contentEl;
    if (!container) return null;

    let mode: string | null = null;
    try {
      mode = typeof this.view.getMode === "function" ? this.view.getMode() : null;
    } catch {
      mode = null;
    }

    if (mode === "preview") {
      const preview = container.querySelector<HTMLElement>(".markdown-preview-view");
      if (preview) return preview;
    } else if (mode === "source") {
      const source = container.querySelector<HTMLElement>(".cm-scroller");
      if (source) return source;
    }

    const sourceScroller = container.querySelector<HTMLElement>(".cm-scroller");
    if (sourceScroller && sourceScroller.clientHeight > 0) return sourceScroller;
    const previewScroller = container.querySelector<HTMLElement>(".markdown-preview-view");
    if (previewScroller && previewScroller.clientHeight > 0) return previewScroller;
    return sourceScroller ?? previewScroller ?? null;
  }

  /**
   * Cheap validity check + rebind. Called from the engine tick — must stay
   * O(1) when nothing changed (it is: just isConnected).
   */
  checkAndRebindScroller(): void {
    if (this.scrollerElement && this.scrollerElement.isConnected) return;

    this.initDOM();
    const current = this.findScroller();
    if (!current) return;

    logger.debug("Active scroller changed (e.g. mode toggle). Rebinding listeners.");
    this.unbindEvents();
    this.scrollerElement = current;
    this.bindEvents();
    this.resizeCanvas();
  }

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */

  private initDOM(): void {
    const contentEl = this.view?.contentEl;
    if (!contentEl) return;

    if (getComputedStyle(contentEl).position === "static") {
      if (this.originalContentElPosition === null) {
        this.originalContentElPosition = contentEl.style.position;
      }
      contentEl.style.position = "relative";
    }

    if (this.container) {
      if (this.container.parentElement !== contentEl) {
        contentEl.appendChild(this.container);
        logger.debug("Re-appended detached heatmap container.");
      } else if (contentEl.lastChild !== this.container) {
        contentEl.appendChild(this.container);
      }
      return;
    }

    this.container = document.createElement("div");
    this.container.className = "frs-heatmap-wrapper";

    const settings = this.getSettings();
    this.container.style.width = `${settings.width}px`;
    this.container.style.right = `${settings.offsetRight}px`;
    this.container.style.opacity = `${settings.opacity}`;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "frs-heatmap-canvas";
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    contentEl.appendChild(this.container);
    logger.debug("Created heatmap container.");

    // One shared tooltip for all renderers.
    let tooltip = document.getElementById(HEATMAP_TOOLTIP_ID);
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = HEATMAP_TOOLTIP_ID;
      tooltip.className = "frs-heatmap-tooltip";
      document.body.appendChild(tooltip);
    }
    this.tooltip = tooltip;
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  private bindEvents(): void {
    if (!this.scrollerElement) return;

    this.registerDomElement(this.scrollerElement, "scroll", () => {
      this.hideTooltip();
      this.draw();
    }, { passive: true });

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.scrollerElement);

    if (this.canvas) {
      this.registerDomElement(this.canvas, "pointermove", (e: PointerEvent) => this.handlePointerMove(e));
      this.registerDomElement(this.canvas, "pointerleave", () => this.hideTooltip());
      // Prevent text selection artifacts while hovering on desktop.
      this.registerDomElement(this.canvas, "pointerdown", (e: Event) => e.preventDefault());
    }
  }

  private unbindEvents(): void {
    // Listeners registered through the plugin lifecycle are removed
    // automatically on unload; here we only handle rebinds.
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Canvas                                                              */
  /* ------------------------------------------------------------------ */

  private syncCanvasSize(): boolean {
    if (!this.scrollerElement || !this.canvas || !this.container || !this.ctx) return false;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const dpr = window.devicePixelRatio || 1;
    const expectedWidth = Math.round(rect.width * dpr);
    const expectedHeight = Math.round(rect.height * dpr);
    if (this.canvas.width !== expectedWidth || this.canvas.height !== expectedHeight) {
      this.canvas.width = expectedWidth;
      this.canvas.height = expectedHeight;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return true;
  }

  resizeCanvas(): void {
    if (this.syncCanvasSize()) this.draw();
  }

  applySettings(): void {
    const settings = this.getSettings();
    if (this.container) {
      this.container.style.width = `${settings.width}px`;
      this.container.style.right = `${settings.offsetRight}px`;
      this.container.style.opacity = `${settings.opacity}`;
    }
    this.resizeCanvas();
  }

  draw(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = requestAnimationFrame(() => this.paint());
  }

  /** Parses the theme accent color once; returns an rgba() factory. */
  private accentColorFactory(): (alpha: number) => string {
    const bodyStyle = getComputedStyle(document.body);
    const colorStr = bodyStyle.getPropertyValue("--interactive-accent").trim();
    let r = 36, g = 143, b = 178;

    if (colorStr.startsWith("#")) {
      const clean = colorStr.replace("#", "");
      if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16);
        g = parseInt(clean[1] + clean[1], 16);
        b = parseInt(clean[2] + clean[2], 16);
      } else if (clean.length === 6) {
        r = parseInt(clean.substring(0, 2), 16);
        g = parseInt(clean.substring(2, 4), 16);
        b = parseInt(clean.substring(4, 6), 16);
      }
    } else if (colorStr.startsWith("rgb")) {
      const matches = colorStr.match(/\d+/g);
      if (matches && matches.length >= 3) {
        r = parseInt(matches[0], 10);
        g = parseInt(matches[1], 10);
        b = parseInt(matches[2], 10);
      }
    }

    return (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private paint(): void {
    this.animationFrameId = null;
    if (!this.canvas || !this.ctx || !this.scrollerElement || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (!this.syncCanvasSize()) return;

    const clientWidth = rect.width;
    const clientHeight = rect.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, clientWidth, clientHeight);

    const path = this.view.file ? this.view.file.path : null;
    if (!path) return;

    const record = this.database.getRecord(path);
    const accent = this.accentColorFactory();

    /* ---- Current viewport indicator (behind everything). ---- */
    const scrollTop = this.scrollerElement.scrollTop;
    const scrollHeight = this.scrollerElement.scrollHeight;
    const scrollerHeight = this.scrollerElement.clientHeight;

    if (scrollHeight > 0) {
      const startPct = scrollTop / scrollHeight;
      const endPct = (scrollTop + scrollerHeight) / scrollHeight;
      const yStart = startPct * clientHeight;
      const yEnd = Math.min(clientHeight, endPct * clientHeight);

      ctx.fillStyle = accent(0.1);
      ctx.fillRect(0, yStart, clientWidth, yEnd - yStart);

      ctx.strokeStyle = accent(0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, yStart);
      ctx.lineTo(clientWidth, yStart);
      ctx.moveTo(0, yEnd);
      ctx.lineTo(clientWidth, yEnd);
      ctx.stroke();
    }

    if (!record) return; // nothing recorded yet — track + viewport only

    const buckets = record.buckets;
    const bucketCount = buckets.length;
    if (bucketCount === 0) return;

    const maxVal = Math.max(...buckets, 1);
    const itemHeight = clientHeight / bucketCount;

    /* ---- Per-bucket intensity texture (the "heat"). ---- */
    // Short horizontal marks whose alpha grows with intensity — readable
    // per-bucket detail at any strip width, unlike the smooth profile.
    for (let i = 0; i < bucketCount; i++) {
      const weight = buckets[i] / maxVal;
      if (weight <= 0) continue;
      const y = (i + 0.5) * itemHeight;
      const barH = Math.max(1, itemHeight * 0.55);
      ctx.fillStyle = accent(0.08 + weight * weight * 0.5);
      ctx.fillRect(1, y - barH / 2, (clientWidth - 2) * weight, barH);
    }

    /* ---- Filled profile area. ---- */
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < bucketCount; i++) {
      const weight = buckets[i] / maxVal;
      const y = (i + 0.5) * itemHeight;
      ctx.lineTo(weight * clientWidth, y);
    }
    ctx.lineTo(0, clientHeight);
    ctx.closePath();
    ctx.fillStyle = accent(0.18);
    ctx.fill();

    /* ---- Profile outline. ---- */
    ctx.beginPath();
    for (let i = 0; i < bucketCount; i++) {
      const weight = buckets[i] / maxVal;
      const y = (i + 0.5) * itemHeight;
      const x = weight * clientWidth;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accent(0.85);
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ */
  /* Tooltip (desktop hover)                                             */
  /* ------------------------------------------------------------------ */

  private handlePointerMove(e: PointerEvent): void {
    if (!this.canvas || !this.tooltip) return;
    // Touch pointers are excluded — on touch the strip is pointer-events:
    // none anyway, but guard here for stylus hover etc.
    if (e.pointerType === "touch") return;

    const rect = this.canvas.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const pct = Math.max(0, Math.min(1, relativeY / Math.max(1, rect.height)));

    const path = this.view.file ? this.view.file.path : null;
    if (!path) return;

    // Read-only: hovering must not create records.
    const record = this.database.getRecord(path);
    if (!record) {
      this.tooltip.innerHTML = `
        <div class="frs-heatmap-tooltip-title">Section ~${Math.round(pct * 100)}%</div>
        <div class="frs-heatmap-tooltip-row"><span>No reading data yet</span></div>`;
      this.positionTooltip(e);
      return;
    }

    const bucketCount = record.buckets.length;
    const bucketIdx = Math.min(bucketCount - 1, Math.floor(pct * bucketCount));
    const ms = record.buckets[bucketIdx] || 0;
    const visits = record.bucketVisits[bucketIdx] || 0;

    // Coverage: share of the note that has any recorded reading time.
    const readBuckets = record.buckets.filter((v) => v > 0).length;
    const coverage = bucketCount > 0 ? Math.round((readBuckets / bucketCount) * 100) : 0;

    const totalSeconds = Math.round(ms / 1000);
    const minStr = Math.floor(totalSeconds / 60);
    const secStr = String(totalSeconds % 60).padStart(2, "0");

    this.tooltip.innerHTML = `
      <div class="frs-heatmap-tooltip-title">Section ~${Math.round(pct * 100)}%</div>
      <div class="frs-heatmap-tooltip-row">
        <span>Time spent</span>
        <span class="frs-heatmap-tooltip-value">${minStr}m ${secStr}s</span>
      </div>
      <div class="frs-heatmap-tooltip-row">
        <span>Visits</span>
        <span class="frs-heatmap-tooltip-value">${visits}</span>
      </div>
      <div class="frs-heatmap-tooltip-row">
        <span>Note coverage</span>
        <span class="frs-heatmap-tooltip-value">${coverage}%</span>
      </div>`;

    this.positionTooltip(e);
  }

  private positionTooltip(e: PointerEvent): void {
    if (!this.tooltip) return;
    const tooltipWidth = this.tooltip.offsetWidth || 150;
    const xPos = e.clientX - tooltipWidth - 15;
    const yPos = Math.max(10, Math.min(window.innerHeight - 110, e.clientY - 30));
    this.tooltip.style.left = `${Math.max(4, xPos)}px`;
    this.tooltip.style.top = `${yPos}px`;
    this.tooltip.style.opacity = "1";
  }

  private hideTooltip(): void {
    if (this.tooltip) this.tooltip.style.opacity = "0";
  }

  /* ------------------------------------------------------------------ */
  /* Teardown                                                            */
  /* ------------------------------------------------------------------ */

  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.unbindEvents();
    // Restore the inline position we may have set on the view.
    if (this.originalContentElPosition !== null && this.view?.contentEl) {
      this.view.contentEl.style.position = this.originalContentElPosition;
      this.originalContentElPosition = null;
    }
    this.container?.remove();
    this.container = null;
    logger.debug("Heatmap renderer destroyed.");
  }
}
