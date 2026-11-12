import { useEffect } from "react";
import { useLenis } from "lenis/react";
import { ScrollTrigger } from "gsap/all";

export function LenisVisibilityFix() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        lenis.stop(); // ⛔ pause RAF calculations
        // Force any in-progress touch gesture to end cleanly
        window.dispatchEvent(new Event("touchend"));
        window.dispatchEvent(new PointerEvent("pointerup"));
      } else {
        lenis.start(); // ▶ resume
        // Let the browser reflow before recalculating
        requestAnimationFrame(() => {
          lenis.resize(); // 🔥 recalc sizes
          lenis.velocity = 0; // Reset velocity directly

          // Force scroll position reset to prevent jitter
          lenis.scrollTo(lenis.scroll, {
            immediate: true,
            force: true,
          });

          // Force an immediate RAF tick
          // lenis.raf(performance.now());
          ScrollTrigger.refresh(); // add this
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [lenis]);

  return null;
}
