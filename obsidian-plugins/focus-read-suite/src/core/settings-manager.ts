/**
 * Focus Read Suite — the centralized settings manager.
 *
 * Every module reads settings through this manager and subscribes to change
 * events, so a value flipped in the settings tab is applied *immediately* by
 * whichever module owns it — no setting exists that only "looks functional".
 *
 * Persistence is debounced (300 ms) so slider dragging does not hammer the
 * disk, but can be forced for critical changes (module toggles, resets).
 */

import { logger } from "./logger";
import {
  FocusSuiteSettings,
  SectionId,
  SECTION_IDS,
  DEFAULT_SETTINGS,
  normalizeSettings,
} from "./settings-schema";

export interface PersistedPayload {
  settings?: Partial<Record<SectionId, any>>;
  stats?: any;
  heatmapRecords?: any;
  migration?: any;
  [key: string]: any;
}

export interface SettingsIo {
  loadData(): Promise<any>;
  saveData(data: any): Promise<void>;
}

type ChangeListener = (changedSections: SectionId[]) => void;

const SAVE_DEBOUNCE_MS = 300;

export class SettingsManager {
  private io: SettingsIo;
  private settingsValue: FocusSuiteSettings;
  private listeners = new Set<ChangeListener>();
  private saveTimer: number | null = null;
  private saving = false;

  /** Extra persisted payloads (stats, heatmap records, migration info). */
  private extras: Record<string, any> = {};

  constructor(io: SettingsIo) {
    this.io = io;
    // Start from defaults until load() runs.
    this.settingsValue = normalizeSettings(null);
  }

  get settings(): FocusSuiteSettings {
    return this.settingsValue;
  }

  get raw(): PersistedPayload {
    return this.extras as PersistedPayload;
  }

  /* ------------------------------------------------------------------ */
  /* Load / persist                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Loads the persisted payload. `onLoad` lets the caller (main.ts) run
   * migration between reading and normalizing.
   */
  async load(onLoad?: (raw: PersistedPayload | null) => Promise<PersistedPayload | null>): Promise<void> {
    let raw: PersistedPayload | null = null;
    try {
      raw = (await this.io.loadData()) as PersistedPayload | null;
    } catch (err) {
      logger.error("Failed to read data.json. Falling back to defaults.", err);
      raw = null;
    }

    if (onLoad) {
      try {
        raw = (await onLoad(raw)) ?? null;
      } catch (err) {
        logger.error("Settings load hook failed. Continuing with raw data.", err);
      }
    }

    if (raw && typeof raw === "object") {
      // Extras are the NON-settings payloads (stats, heatmap records,
      // migration info). `settings` and `version` are owned by this manager
      // and must never linger in extras — a stale copy there would
      // overwrite fresh settings on every save.
      const { settings: _settings, version: _version, ...extrasOnly } = raw as Record<string, any>;
      this.extras = extrasOnly;
      this.settingsValue = normalizeSettings(raw.settings ?? undefined);
    } else {
      this.extras = {};
      this.settingsValue = normalizeSettings(null);
    }
  }

  /** Builds the full payload that gets written to data.json. */
  private buildPayload(): PersistedPayload {
    // Settings/version are written LAST so they can never be shadowed by
    // stale extras.
    return {
      ...this.extras,
      version: 2,
      settings: this.settingsValue,
    };
  }

  async persist(immediate = true): Promise<void> {
    if (immediate) {
      this.cancelPendingSave();
      await this.flush();
      return;
    }
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  private cancelPendingSave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private async flush(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      await this.io.saveData(this.buildPayload());
    } catch (err) {
      logger.error("Failed to save settings.", err);
    } finally {
      this.saving = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Updates                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The one write path. Applies `mutate` to a working copy, normalizes the
   * affected sections, persists, and notifies subscribers.
   *
   * @param mutate  receives a mutable draft (a deep copy); return nothing.
   * @param sections the sections the caller believes it touched — used for
   *                 normalization and change notification.
   * @param immediate force an instant disk write (default) vs debounced.
   */
  async update(
    sections: SectionId | SectionId[],
    mutate: (draft: FocusSuiteSettings) => void,
    immediate = true
  ): Promise<void> {
    const sectionList = Array.isArray(sections) ? sections : [sections];

    // Start from the CURRENT settings (never defaults!) and give the
    // mutator a deep copy of only the affected sections.
    const next = { ...this.settingsValue } as FocusSuiteSettings;
    for (const s of sectionList) {
      (next as any)[s] = JSON.parse(JSON.stringify((this.settingsValue as any)[s]));
    }

    try {
      mutate(next);
    } catch (err) {
      logger.error("Settings update threw; rejecting the change.", err);
      return;
    }

    // Normalize ONLY the affected sections, then graft the normalized
    // sections back onto the untouched current settings — sections that
    // were not part of this update are never reset to defaults.
    const normalized = normalizeSettings(
      next as unknown as Partial<Record<SectionId, any>>,
      sectionList
    );
    const merged = { ...this.settingsValue } as FocusSuiteSettings;
    for (const s of sectionList) {
      (merged as any)[s] = (normalized as any)[s];
    }

    const changed: SectionId[] = [];
    for (const s of sectionList) {
      if (JSON.stringify((this.settingsValue as any)[s]) !== JSON.stringify((merged as any)[s])) {
        changed.push(s);
      }
    }

    this.settingsValue = merged;
    if (changed.length > 0) {
      await this.persist(immediate);
      this.emit(changed);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Extras (stats, records, migration info)                             */
  /* ------------------------------------------------------------------ */

  /** Reads an extra persisted payload (e.g. "stats", "heatmapRecords"). */
  getExtra<T>(key: string): T | undefined {
    return this.extras[key] as T | undefined;
  }

  /** Writes an extra payload and schedules persistence. */
  async setExtra(key: string, value: unknown, immediate = false): Promise<void> {
    this.extras[key] = value;
    await this.persist(immediate);
  }

  /* ------------------------------------------------------------------ */
  /* Reset                                                               */
  /* ------------------------------------------------------------------ */

  /** Resets the given sections to their defaults (settings only). */
  async resetSections(sections: SectionId[]): Promise<void> {
    const next = { ...this.settingsValue } as FocusSuiteSettings;
    for (const s of sections) {
      (next as any)[s] = JSON.parse(JSON.stringify((DEFAULT_SETTINGS as any)[s]));
    }
    this.settingsValue = next;
    await this.persist(true);
    this.emit(sections);
  }

  /**
   * Replaces the whole settings object with an externally-built one
   * (used by the migration re-run). Normalizes, persists and notifies.
   */
  async replaceAllSettings(next: Partial<Record<SectionId, any>>): Promise<void> {
    this.settingsValue = normalizeSettings(next);
    await this.persist(true);
    this.emit(SECTION_IDS);
  }

  /* ------------------------------------------------------------------ */
  /* Change events                                                       */
  /* ------------------------------------------------------------------ */

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(changed: SectionId[]): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(changed);
      } catch (err) {
        logger.error("A settings change listener threw.", err);
      }
    }
  }
}
