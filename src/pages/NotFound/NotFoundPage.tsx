import React from "react";
import { Link } from "react-router-dom";
import { Header } from "../../components/header/Header";
import sealSad from "../../images/seal-sad.png";
import "../../styles/layout-shell.css";
import "./not-found.css";

const SEAL_INFO_URL = "https://cicon.ru/seritulen-balt.html";

export const NotFoundPage = () => {
  return (
    <main className="nf-page" aria-label="Страница 404">
      <svg
        className="nf-bg404"
        viewBox="0 0 720 300"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="nf404Gradient" x1="0" y1="0" x2="720" y2="300" gradientUnits="userSpaceOnUse">
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-300 0; 300 0; -300 0"
              dur="6s"
              repeatCount="indefinite"
            />
            <stop offset="0%" stopColor="#b889ff" />
            <stop offset="28%" stopColor="#c7a8ff" />
            <stop offset="62%" stopColor="#8ec5ff" />
            <stop offset="100%" stopColor="#6fb6ff" />
          </linearGradient>
        </defs>
        {/* Заливка на весь viewBox — при растяжении закрывает всю ширину/высоту экрана без «полос» */}
        <rect className="nf-bg404-fill" x="0" y="0" width="720" height="300" />
        <text
          x="350"
          y="190"
          className="nf-bg404-text"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="url(#nf404Gradient)"
        >
          404
        </text>
      </svg>

      <div className="nf-shell">
        <div className="shell">
          <Header />
        </div>

        <span className="nf-sparkle one" />
        <span className="nf-sparkle two" />
        <span className="nf-sparkle three" />
        <span className="nf-sparkle four" />

        <section className="nf-card" aria-label="Ошибка 404">
          <a href={SEAL_INFO_URL} target="_blank" rel="noreferrer">
            <img className="nf-seal" src={sealSad} alt="Грустный тюлень" />
          </a>
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
