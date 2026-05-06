/**
 * storage-access-helper.js
 *
 * Runs in all HTTP/HTTPS frames (all_frames: true), including the contentFrame
 * iframe inside MiniWeb's PiP window.
 *
 * Purpose: silently attempt to restore first-party storage access for the embedded
 * page so that login state can be shared with the popup that opened it.
 *
 * Behaviour:
 *   1. On load — check hasStorageAccess(). If not granted, call requestStorageAccess().
 *      This succeeds silently when the browser already has a prior grant (e.g. same-site
 *      heuristic, user has previously allowed it, or the site has a Privacy Sandbox
 *      grant). If the browser requires a user gesture it will reject and we catch silently.
 *   2. postMessage — parent can send { type: "miniweb-request-storage-access", requestId }
 *      to retry the request (useful when triggered by a user gesture in the parent frame).
 *      Result is sent back as { type: "miniweb-storage-access-result", requestId, ok, error? }.
 *
 * Security notes:
 *   - We only act in subframes (window !== window.top).
 *   - We never read or forward any cookie/storage values.
 *   - postMessage replies are sent to event.source with origin "*" — acceptable because we
 *     send no sensitive data; the only information disclosed is whether the browser granted
 *     storage access.
 */
(function () {
  "use strict";

  if (typeof document === "undefined") return;
  if (!("requestStorageAccess" in document)) return;
  if (window === window.top) return; // only run inside subframes

  const hostname = (() => {
    try { return window.location.hostname; } catch { return "unknown"; }
  })();

  const log = (msg) =>
    console.log(`[MiniWeb][StorageAccess] ${msg} (${hostname})`);

  // ── Auto-attempt on load ───────────────────────────────────────────────────
  // requestStorageAccess() without a user gesture resolves immediately when the
  // browser already grants access via heuristics (prior visit, same-site, etc.)
  // and rejects (silently caught) when a user gesture is required.
  void document.hasStorageAccess()
    .then((hasAccess) => {
      if (hasAccess) {
        log("already has storage access — no action needed");
        return Promise.resolve();
      }
      log("no storage access yet — requesting…");
      return document.requestStorageAccess();
    })
    .then(() => {
      log("storage access granted ✓");
    })
    .catch((err) => {
      // Expected on first-load without user gesture. Not an error worth surfacing.
      log(`storage access not granted (${String(err?.message ?? err)})`);
    });

  // ── Explicit trigger via postMessage ──────────────────────────────────────
  // When the parent (PiP launcher) detects a user gesture, it can trigger a
  // retry that may succeed where the auto-attempt failed.
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "miniweb-request-storage-access") {
      return;
    }

    const requestId = String(event.data.requestId ?? "");
    void document.requestStorageAccess()
      .then(() => {
        log("storage access granted via explicit trigger ✓");
        event.source?.postMessage(
          { type: "miniweb-storage-access-result", requestId, ok: true },
          "*"
        );
      })
      .catch((err) => {
        log(`storage access denied via explicit trigger: ${String(err?.message ?? err)}`);
        event.source?.postMessage(
          {
            type: "miniweb-storage-access-result",
            requestId,
            ok: false,
            error: String(err?.message ?? err),
          },
          "*"
        );
      });
  });
})();
