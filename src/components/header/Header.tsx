import React from "react";
import { Link, useLocation } from "react-router-dom";
import sealaraLogo from "../../assets/sealara-logo.png";
import "./header.css";

const NAV_ITEMS = [
  { id: "conditions", label: "заболевания" },
  { id: "diagnosis", label: "диагностика" },
  { id: "doctors", label: "врачи" },
  { id: "profile", label: "профиль" },
] as const;

export const Header = () => {
  const location = useLocation();
  const activeNav = new URLSearchParams(location.search).get("nav") ?? "";

  return (
    <header className="site-header">
      <Link className="site-logo" to="/">
        <img className="site-logo-img" src={sealaraLogo} alt="" decoding="async" />
        <span className="site-logo-text">Sealara</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        {NAV_ITEMS.map(({ id, label }) => {
          const isActive = activeNav === id;
          return (
            <Link
              key={id}
              to={`/not-found?nav=${id}`}
              className={`site-nav-link${isActive ? " site-nav-link--active" : ""}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
};
