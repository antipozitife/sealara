import { useEffect, useState } from "react";
import "./scroll-to-top-button.css";

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const marker = document.getElementById("page-top");
    if (!marker) return;

    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);

  return (
    <a
      href="#page-top"
      className={`scroll-to-top${visible ? " scroll-to-top--visible" : ""}`}
      aria-label="Прокрутить страницу наверх"
      title="Наверх"
    >
      <span aria-hidden="true">↑</span>
    </a>
  );
}
