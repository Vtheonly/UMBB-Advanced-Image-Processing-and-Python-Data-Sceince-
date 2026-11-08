/**
 * Focus Read: Timer & Nudge — the daily goal ("dopamine") bar.
 */

export const DOPAMINE_BAR_ID = "frt-dopamine-bar";

export class DopamineBar {
  private bar: HTMLElement | null = null;
  private label: HTMLElement | null = null;

  mount(): void {
    if (document.getElementById(DOPAMINE_BAR_ID)) return;

    const bar = document.createElement("div");
    bar.id = DOPAMINE_BAR_ID;
    bar.className = "frt-dopamine-bar";
    bar.innerHTML = `<div class="frt-dopamine-bar-fill"></div>`;
    bar.style.display = "none";
    document.body.appendChild(bar);

    const label = document.createElement("div");
    label.id = `${DOPAMINE_BAR_ID}-label`;
    label.className = "frt-dopamine-bar-label";
    label.style.display = "none";
    document.body.appendChild(label);

    this.bar = bar;
    this.label = label;
  }

  destroy(): void {
    this.bar?.remove();
    this.label?.remove();
    this.bar = null;
    this.label = null;
  }

  applyVisibility(enabled: boolean): void {
    this.mountIfMissing();
    if (this.bar) this.bar.style.display = enabled ? "block" : "none";
    if (this.label) this.label.style.display = enabled ? "block" : "none";
    if (enabled) this.render(0, 1);
  }

  private mountIfMissing(): void {
    if (!this.bar || !this.label || !document.getElementById(DOPAMINE_BAR_ID)) {
      this.bar = null;
      this.label = null;
      this.mount();
    }
  }

  render(todayMinutes: number, goalMinutes: number): void {
    this.mountIfMissing();
    if (!this.bar || !this.label) return;
    const goal = Math.max(1, goalMinutes);
    const pct = Math.min(100, Math.round((todayMinutes / goal) * 100));
    const fill = this.bar.querySelector<HTMLElement>(".frt-dopamine-bar-fill");
    if (fill) fill.style.width = `${pct}%`;
    this.label.textContent = `${todayMinutes} / ${goal} min (${pct}%)`;
  }
}
