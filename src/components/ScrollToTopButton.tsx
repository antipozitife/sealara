import "./scroll-to-top-button.css";

export function ScrollToTopButton() {
  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      className="scroll-to-top"
      onClick={scrollToTop}
      aria-label="Прокрутить страницу наверх"
      title="Наверх"
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
