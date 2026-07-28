import { useEffect, useLayoutEffect, useRef, useState } from "react";

const HOME_SCROLL_KEY = "sealara-home-scroll-y";

export function useHomeScrollPosition() {
  useLayoutEffect(() => {
    const raw = sessionStorage.getItem(HOME_SCROLL_KEY);
    if (raw === null) return;
    const position = Number.parseInt(raw, 10);
    if (!Number.isFinite(position) || position < 0) return;
    const restore = () => window.scrollTo(0, position);
    restore();
    requestAnimationFrame(() => requestAnimationFrame(restore));
  }, []);

  useLayoutEffect(() => () => sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY)), []);

  useEffect(() => {
    let animationFrame = 0;
    const persist = () => {
      if (animationFrame) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY));
      });
    };
    window.addEventListener("scroll", persist, { passive: true });
    return () => window.removeEventListener("scroll", persist);
  }, []);
}

export function useRevealOnIntersection<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const element = ref.current;
    if (!element) return;
    let animationFrame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        cancelAnimationFrame(animationFrame);
        if (!entry.isIntersecting) {
          setVisible(false);
          return;
        }
        animationFrame = requestAnimationFrame(() => {
          animationFrame = requestAnimationFrame(() => setVisible(true));
        });
      },
      { threshold: 0.08, rootMargin: "0px" },
    );
    observer.observe(element);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return { ref, visible };
}
