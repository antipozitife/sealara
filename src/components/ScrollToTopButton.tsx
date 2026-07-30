import { useEffect, useState } from "react";
import "./scroll-to-top-button.css";

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 320);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      className={`scroll-to-top${visible ? " scroll-to-top--visible" : ""}`}
      onClick={scrollToTop}
      aria-label="Прокрутить страницу наверх"
      title="Наверх"
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
