// Puts the writer's paper and ink on the whole page. The colours themselves live in passage.css,
// keyed off these data attributes, mirroring the app's PaperStyleCatalog / PaperToneCatalog /
// InkToneCatalog (DesignSystem). An id this page doesn't know matches no rule, so it falls back to
// the catalog default (plain, classic, black), the same way the app does.

export function applyAppearance(payload, root = document.documentElement) {
  root.dataset.paperStyle = String(payload.paperStyleID ?? "");
  root.dataset.paperTone = String(payload.paperToneID ?? "");
  root.dataset.inkTone = String(payload.inkToneID ?? "");

  // Let Safari tint its bars in the same stock.
  const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (paper && meta) meta.content = paper;
}
