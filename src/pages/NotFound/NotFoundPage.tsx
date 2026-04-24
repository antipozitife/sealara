import React from "react";
import { Link } from "react-router-dom";
import { Header } from "../../components/header/Header";
import "../../styles/layout-shell.css";
import "./not-found.css";

export const NotFoundPage = () => {
  return (
    <main className="nf-page" aria-label="Страница 404">
      <div className="nf-bg404">404</div>

      <div className="nf-shell">
        <div className="shell">
          <Header />
        </div>

        <span className="nf-sparkle one" />
        <span className="nf-sparkle two" />
        <span className="nf-sparkle three" />
        <span className="nf-sparkle four" />

        <section className="nf-card" aria-label="Ошибка 404">
          <div className="nf-seal" />
          <div className="nf-message">Ой, что-то пошло не так!</div>
          <Link className="nf-btn" to="/">
            <span className="nf-arr">←</span>
            <span>на главную</span>
          </Link>
        </section>
      </div>
    </main>
  );
};
