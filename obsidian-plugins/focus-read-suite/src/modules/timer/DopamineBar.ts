/**
 * Focus Read Suite — the daily reading goal bar ("dopamine bar").
 *
 * A slim progress strip pinned to the bottom of the window with a small
 * floating label. Respects the iOS/Android safe-area insets.
 */

export const GOAL_BAR_ID = "frs-goal-bar";
export const GOAL_BAR_LABEL_ID = "frs-goal-bar-label";

export class GoalBar {
  private bar: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  /** Guard: a destroyed bar must never resurrect via render(). */
  private destroyed = false;

  mount(): void {
    if (this.destroyed) return;
    if (document.getElementById(GOAL_BAR_ID)) return;

    const bar = document.createElement("div");
    bar.id = GOAL_BAR_ID;
    bar.className = "frs-goal-bar";
    bar.innerHTML = `<div class="frs-goal-bar-fill"></div>`;
    bar.style.display = "none";
    document.body.appendChild(bar);

    const label = document.createElement("div");
    label.id = GOAL_BAR_LABEL_ID;
    label.className = "frs-goal-bar-label";
    label.style.display = "none";
    document.body.appendChild(label);

    this.bar = bar;
    this.label = label;
  }

  destroy(): void {
    this.destroyed = true;
    this.bar?.remove();
    this.label?.remove();
    this.bar = null;
    this.label = null;
  }

  applyVisibility(enabled: boolean): void {
    if (this.destroyed) return;
    this.mountIfMissing();
    if (this.bar) this.bar.style.display = enabled ? "block" : "none";
    if (this.label) this.label.style.display = enabled ? "block" : "none";
    if (enabled) this.render(0, 1);
  }

  private mountIfMissing(): void {
    if (!this.bar || !this.label || !document.getElementById(GOAL_BAR_ID)) {
      this.bar = null;
      this.label = null;
      this.mount();
    }
  }

  render(todayMinutes: number, goalMinutes: number): void {
    if (this.destroyed) return;
    this.mountIfMissing();
    if (!this.bar || !this.label) return;
    const goal = Math.max(1, goalMinutes);
    const pct = Math.min(100, Math.round((todayMinutes / goal) * 100));
    const fill = this.bar.querySelector<HTMLElement>(".frs-goal-bar-fill");
    if (fill) fill.style.width = `${pct}%`;
    this.label.textContent = `${todayMinutes} / ${goal} min (${pct}%)`;
  }
}
