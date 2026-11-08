/**
 * Test stub for the `obsidian` module.
 *
 * Provides in-memory implementations of the handful of Obsidian APIs the three
 * plugins use, so plugin code can be imported and exercised inside happy-dom
 * without the real application. Deliberately minimal: it records what happened
 * (commands, notices, listeners) so tests can assert on it.
 */

export class Events {
  private handlers = new Map<string, Array<(data: any) => any>>();

  on(name: string, callback: (data: any) => any, _ctx?: any): EventRefStub {
    if (!this.handlers.has(name)) this.handlers.set(name, []);
    this.handlers.get(name)!.push(callback);
    return { name, callback };
  }

  offref(_ref: EventRefStub): void {
    // not needed for these tests
  }

  trigger(name: string, ...args: any[]): void {
    for (const cb of this.handlers.get(name) ?? []) cb(...args);
  }
}

export interface EventRefStub {
  name: string;
  callback: (data: any) => any;
}

export class TAbstractFile {
  vault: any;
  path = "";
  name = "";
  parent: any = null;
}

export class TFile extends TAbstractFile {
  stat = { ctime: 0, mtime: 0, size: 0 };
  basename = "";
  extension = "md";
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return !this.parent;
  }
}

export class Notice {
  static messages: string[] = [];
  constructor(public message: string | DocumentFragment, _duration?: number) {
    Notice.messages.push(String(message));
  }
  static reset(): void {
    Notice.messages = [];
  }
  hide(): void {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: HTMLElement;
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = (globalThis as any).document?.createElement("div") as HTMLElement;
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  name = "";
  desc = "";
  components: any[] = [];

  constructor(public containerEl?: HTMLElement) {
    this.settingEl = (globalThis as any).document?.createElement("div") as HTMLElement;
    if (containerEl) containerEl.appendChild(this.settingEl);
  }

  setName(name: string | DocumentFragment): this {
    this.name = String(name);
    return this;
  }
  setDesc(desc: string | DocumentFragment): this {
    this.desc = String(desc);
    return this;
  }
  setClass(_cls: string): this {
    return this;
  }
  setTooltip(_tooltip: string): this {
    return this;
  }

  private add<T>(component: T): T {
    this.components.push(component);
    return component;
  }

  addToggle(cb: (toggle: ToggleStub) => any): this {
    const toggle = new ToggleStub();
    cb(toggle);
    return this.add(toggle) && this;
  }

  addSlider(cb: (slider: SliderStub) => any): this {
    const slider = new SliderStub();
    cb(slider);
    return this.add(slider) && this;
  }

  addText(cb: (text: TextStub) => any): this {
    const text = new TextStub();
    cb(text);
    return this.add(text) && this;
  }

  addDropdown(cb: (dropdown: DropdownStub) => any): this {
    const dropdown = new DropdownStub();
    cb(dropdown);
    return this.add(dropdown) && this;
  }

  addColorPicker(cb: (picker: ColorPickerStub) => any): this {
    const picker = new ColorPickerStub();
    cb(picker);
    return this.add(picker) && this;
  }

  addButton(cb: (button: ButtonStub) => any): this {
    const button = new ButtonStub();
    cb(button);
    return this.add(button) && this;
  }
}

export class ToggleStub {
  value = false;
  changeListener?: (value: boolean) => any;
  setValue(v: boolean): this {
    this.value = v;
    return this;
  }
  onChange(cb: (value: boolean) => any): this {
    this.changeListener = cb;
    return this;
  }
  simulateChange(value: boolean): void {
    this.value = value;
    this.changeListener?.(value);
  }
}

export class SliderStub {
  value = 0;
  limits: [number, number, number] = [0, 0, 1];
  changeListener?: (value: number) => any;
  setLimits(min: number, max: number, step: number): this {
    this.limits = [min, max, step];
    return this;
  }
  setValue(v: number): this {
    this.value = v;
    return this;
  }
  setDynamicTooltip(): this {
    return this;
  }
  onChange(cb: (value: number) => any): this {
    this.changeListener = cb;
    return this;
  }
  simulateChange(value: number): void {
    this.value = value;
    this.changeListener?.(value);
  }
}

export class TextStub {
  value = "";
  disabled = false;
  changeListener?: (value: string) => any;
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  setDisabled(v: boolean): this {
    this.disabled = v;
    return this;
  }
  onChange(cb: (value: string) => any): this {
    this.changeListener = cb;
    return this;
  }
  simulateChange(value: string): void {
    this.value = value;
    this.changeListener?.(value);
  }
}

export class DropdownStub {
  value = "";
  options: Record<string, string> = {};
  changeListener?: (value: string) => any;
  addOption(value: string, display: string): this {
    this.options[value] = display;
    return this;
  }
  addOptions(options: Record<string, string>): this {
    this.options = { ...this.options, ...options };
    return this;
  }
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (value: string) => any): this {
    this.changeListener = cb;
    return this;
  }
  simulateChange(value: string): void {
    this.value = value;
    this.changeListener?.(value);
  }
}

export class ColorPickerStub {
  value = "#000000";
  changeListener?: (value: string) => any;
  setValue(v: string): this {
    this.value = v;
    return this;
  }
  onChange(cb: (value: string) => any): this {
    this.changeListener = cb;
    return this;
  }
  simulateChange(value: string): void {
    this.value = value;
    this.changeListener?.(value);
  }
}

export class ButtonStub {
  text = "";
  warning = false;
  disabled = false;
  clickListener?: () => any;
  setButtonText(t: string): this {
    this.text = t;
    return this;
  }
  setWarning(): this {
    this.warning = true;
    return this;
  }
  setDisabled(v: boolean): this {
    this.disabled = v;
    return this;
  }
  setCta(): this {
    return this;
  }
  onClick(cb: () => any): this {
    this.clickListener = cb;
    return this;
  }
  simulateClick(): void {
    this.clickListener?.();
  }
}

export class MarkdownView {
  app: any;
  file: TFile | null = null;
  contentEl: HTMLElement;
  constructor() {
    this.contentEl = (globalThis as any).document?.createElement("div") as HTMLElement;
  }
  getMode(): "source" | "preview" {
    return "source";
  }
}

export class Modal {
  app: any;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  constructor(app: any) {
    this.app = app;
    const doc = (globalThis as any).document;
    this.modalEl = doc?.createElement("div");
    this.titleEl = doc?.createElement("h2");
    this.contentEl = doc?.createElement("div");
  }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class ButtonComponent {
  el: HTMLElement;
  constructor(containerEl?: HTMLElement) {
    this.el = (globalThis as any).document?.createElement("button");
    containerEl?.appendChild(this.el);
  }
  setButtonText(t: string): this {
    this.el?.setText?.(t);
    return this;
  }
  setWarning(): this {
    return this;
  }
  setCta(): this {
    return this;
  }
  setDisabled(_v: boolean): this {
    return this;
  }
  onClick(cb: () => any): this {
    this.el?.addEventListener("click", cb as any);
    return this;
  }
}

/** Minimal workspace stub with the events the plugins listen to. */
export class WorkspaceStub extends Events {
  layoutReady = true;
  leftSplit: any = null;
  rightSplit: any = null;
  activeLeaf: any = null;

  iterateAllLeaves(cb: (leaf: any) => void): void {
    for (const leaf of this.leaves) cb(leaf);
  }

  leaves: any[] = [];

  getActiveViewOfType<T>(_type: any): T | null {
    return (this.activeView ?? null) as T | null;
  }

  getLeavesOfType(_type: string): any[] {
    return this.leaves;
  }

  activeView: any = null;

  onLayoutReady(cb: () => any): void {
    cb();
  }
}

export class VaultStub extends Events {
  files: Map<string, TAbstractFile> = new Map();

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this.files.get(path) ?? null;
  }
}

/** Builds a fake `app` object with workspace + vault. */
export function createAppStub() {
  return {
    workspace: new WorkspaceStub(),
    vault: new VaultStub(),
    fileId: null as string | null,
    lastEvent: null as any,
  };
}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isPhone: false,
  isTablet: false,
};

/**
 * Minimal `Plugin` base class. It emulates the parts of the Obsidian plugin
 * lifecycle the plugins rely on: settings persistence, command registration,
 * automatic cleanup of DOM listeners / intervals / event refs on unload.
 */
export class Plugin {
  app: any;
  manifest: any;
  loaded = false;

  /** recorded registrations for assertions and cleanup */
  commands: Array<{ id: string; name: string; callback: () => any }> = [];
  registeredDomEvents: Array<{ el: any; type: string; fn: any; options: any }> = [];
  registeredIntervals: number[] = [];
  registeredTimeouts: number[] = [];
  registeredEventRefs: any[] = [];
  onUnloadCallbacks: Array<() => any> = [];
  settingTabs: PluginSettingTab[] = [];
  keybindings: any[] = [];

  private data: any = null;

  constructor(app: any, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  async loadData(): Promise<any> {
    return this.data === null ? null : JSON.parse(JSON.stringify(this.data));
  }

  async saveData(data: any): Promise<void> {
    this.data = JSON.parse(JSON.stringify(data));
  }

  /** test helper */
  __setData(data: any): void {
    this.data = JSON.parse(JSON.stringify(data));
  }
  /** test helper */
  __getData(): any {
    return this.data;
  }

  addCommand(command: { id: string; name: string; callback?: () => any; hotkeys?: any[]; checkCallback?: (checking: boolean) => boolean }): any {
    const entry = { id: command.id, name: command.name, callback: command.callback ?? (() => {}) };
    this.commands.push(entry);
    return entry;
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.settingTabs.push(tab);
  }

  registerDomEvent(el: any, type: string, callback: any, options?: any): void {
    el.addEventListener(type, callback, options);
    this.registeredDomEvents.push({ el, type, fn: callback, options });
  }

  registerInterval(id: number): number {
    this.registeredIntervals.push(id);
    return id;
  }

  registerTimeout?(id: number): number {
    this.registeredTimeouts.push(id);
    return id;
  }

  registerEvent(ref: any): void {
    this.registeredEventRefs.push(ref);
  }

  register(cb: () => any): void {
    this.onUnloadCallbacks.push(cb);
  }

  registerMarkdownPostProcessor(processor: any): void {
    void processor;
  }

  async onload(): Promise<void> {
    this.loaded = true;
  }

  /**
   * Simulates Obsidian's framework teardown of everything the plugin
   * registered (DOM listeners, intervals, event refs, callbacks).
   * The real app does this automatically after calling onunload.
   */
  __obsidianTeardown(): void {
    for (const cb of this.onUnloadCallbacks) cb();
    for (const { el, type, fn, options } of this.registeredDomEvents) {
      el.removeEventListener(type, fn, options);
    }
    for (const id of this.registeredIntervals) clearInterval(id);
    for (const id of this.registeredTimeouts) clearTimeout(id);
    this.commands = [];
    this.registeredDomEvents = [];
    this.registeredIntervals = [];
    this.registeredTimeouts = [];
    this.onUnloadCallbacks = [];
    this.registeredEventRefs = [];
    this.loaded = false;
  }

  async onunload(): Promise<void> {
    this.__obsidianTeardown();
  }
}

export function debounce<T extends (...args: any[]) => any>(cb: T, timeout = 0, _resetTimer = false): T & { cancel(): void } {
  let ref: any = null;
  const wrapped = ((...args: any[]) => {
    if (ref) clearTimeout(ref);
    ref = setTimeout(() => cb(...args), timeout);
  }) as T & { cancel(): void };
  wrapped.cancel = () => {
    if (ref) clearTimeout(ref);
  };
  return wrapped;
}
