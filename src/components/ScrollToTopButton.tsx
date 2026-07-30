import { useEffect, useState } from "react";
import "./scroll-to-top-button.css";

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const getScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const updateVisibility = () => setVisible(getScrollTop() > 16);

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    document.addEventListener("scroll", updateVisibility, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateVisibility);
      document.removeEventListener("scroll", updateVisibility);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setVisible(false);
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
