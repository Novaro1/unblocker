"use strict";

// ── Splash screen ─────────────────────────────────────────────────────────
(function () {
  const splash = document.getElementById("splash");
  if (!splash) return;

  let done = false;

  function dismiss() {
    if (done) return;
    done = true;
    splash.classList.add("splash-exit");
    // Remove from DOM after animation so it can't block clicks
    splash.addEventListener("animationend", () => {
      splash.style.display = "none";
    }, { once: true });
    // Fallback in case animationend doesn't fire
    setTimeout(() => { splash.style.display = "none"; }, 700);
  }

  // Auto-dismiss after animation completes (~2.3s)
  setTimeout(dismiss, 2300);

  // Skip on click anywhere on the splash
  splash.addEventListener("click", dismiss);

  // Skip on any key press
  document.addEventListener("keydown", dismiss, { once: true });
})();
