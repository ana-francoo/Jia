// The /r/{id} page: decides what to show from its own location and draws it with textContent only
// (never innerHTML), so a passage can never inject markup. No analytics, no cookies, no storage.
//
// Design (#357): the writer's paper and ink via r/appearance.js, the "Get app" footer via r/footer.js; expired notice (#355).

import { formatPassageDate, resolvePassage, runClassName } from "/r/passage.js";
import { applyAppearance } from "/r/appearance.js";
import { revealFooterOnScroll } from "/r/footer.js";

function show(id) {
  document.getElementById(id).hidden = false;
  document.getElementById("passage-page").removeAttribute("aria-busy");
}

function renderPassage(payload) {
  const date = document.getElementById("passage-date");
  date.textContent = formatPassageDate(payload.date);
  date.dateTime = payload.date;
  const body = document.getElementById("passage-body");
  body.replaceChildren();
  for (const run of payload.runs) {
    const span = document.createElement("span");
    span.className = runClassName(run.voice);
    span.textContent = run.text;
    body.appendChild(span);
  }
  // Catalog ids for the paper and ink, for #357's styling to key off.
  const article = document.getElementById("passage");
  article.dataset.paperStyle = payload.paperStyleID;
  article.dataset.paperTone = payload.paperToneID;
  article.dataset.inkTone = payload.inkToneID;
  applyAppearance(payload);
  show("passage");
  revealFooterOnScroll();
}

const result = await resolvePassage(window.location);
switch (result.kind) {
  case "passage":
    renderPassage(result.payload);
    break;
  case "expired":
    show("notice-expired");
    break;
  case "error":
    show("notice-error");
    break;
  default:
    show("notice-unknown");
}
