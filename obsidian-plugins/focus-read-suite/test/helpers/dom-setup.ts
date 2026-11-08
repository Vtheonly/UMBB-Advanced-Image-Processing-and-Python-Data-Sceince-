/**
 * Shared per-test DOM preparation: clears the document and installs the
 * Obsidian HTMLElement extensions (createEl/createDiv/…).
 */
import { beforeEach } from "vitest";
import { installDomExtensions } from "./dom";

installDomExtensions();

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  // Reset any classes modules may have left on <body>.
  document.body.className = "";
  document.documentElement.style.cssText = "";
});
