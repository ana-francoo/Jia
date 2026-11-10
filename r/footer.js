// The "Get app" footer: revealed once the reader scrolls (or, for a passage too short to scroll,
// after a short pause), dismissed for good by its close button. No storage: a dismissal lasts for
// this page view only. Motion is CSS; reduced motion is handled there.

const REVEAL_AFTER_PX = 120;
const SHORT_PAGE_DELAY_MS = 1600;

export function revealFooterOnScroll(footer = document.getElementById("get-app"), win = window) {
  if (!footer) return;
  const close = footer.querySelector(".get-app-close");
  let revealed = false;
  let timer;

  function reveal() {
    if (revealed) return;
    revealed = true;
    stopWatching();
    footer.hidden = false;
    footer.getBoundingClientRect(); // commit the hidden state so the entrance transitions
    footer.classList.add("is-revealed");
  }

  function onScroll() {
    if (win.scrollY > REVEAL_AFTER_PX) reveal();
  }

  function stopWatching() {
    win.removeEventListener("scroll", onScroll);
    clearTimeout(timer);
  }

  function dismiss() {
    footer.classList.remove("is-revealed");
    // Keep focus on the page rather than letting it fall to <body> with the footer.
    document.getElementById("passage")?.focus({ preventScroll: true });
    const hide = () => { footer.hidden = true; };
    footer.addEventListener("transitionend", hide, { once: true });
    setTimeout(hide, 600); // reduced motion, or no transition fired
  }

  close?.addEventListener("click", dismiss);
  win.addEventListener("scroll", onScroll, { passive: true });

  const scrollable = document.documentElement.scrollHeight - win.innerHeight > REVEAL_AFTER_PX;
  if (!scrollable) timer = setTimeout(reveal, SHORT_PAGE_DELAY_MS);
}
