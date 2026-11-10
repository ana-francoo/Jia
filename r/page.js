// The /r/{id} page: decides what to show from its own location and draws it with textContent only
// (never innerHTML), so a passage can never inject markup. No analytics, no cookies, no storage.
//
// Plain on purpose: the polished design (pills, footer, the writer's paper and ink) is #357, the
// expired notice #355 (done).

import { formatPassageDate, resolvePassage } from "/r/passage.js";

function show(id) {
  document.getElementById(id).hidden = false;
  document.getElementById("passage-page").removeAttribute("aria-busy");
}

function renderPassage(payload) {
  document.getElementById("passage-date").textContent = formatPassageDate(payload.date);
  const body = document.getElementById("passage-body");
  body.replaceChildren();
  for (const run of payload.runs) {
    const span = document.createElement("span");
    span.className = run.voice === "companion" ? "run run-companion" : "run run-writer";
    span.textContent = run.text;
    body.appendChild(span);
  }
  // Catalog ids for the paper and ink, for #357's styling to key off.
  const article = document.getElementById("passage");
  article.dataset.paperStyle = payload.paperStyleID;
  article.dataset.paperTone = payload.paperToneID;
  article.dataset.inkTone = payload.inkToneID;
  show("passage");
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
