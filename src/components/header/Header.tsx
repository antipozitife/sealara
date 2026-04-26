import React from "react";
import { Link, useLocation } from "react-router-dom";
import sealaraLogo from "../../images/sealara-logo.png";
import "./header.css";

const NAV_ITEMS = [
  { id: "conditions", label: "заболевания", to: "/diseases" },
  { id: "diagnosis", label: "диагностика", to: "/not-found?nav=diagnosis" },
  { id: "doctors", label: "врачи", to: "/not-found?nav=doctors" },
  { id: "profile", label: "профиль", to: "/profile" },
] as const;

export const Header = () => {
  const location = useLocation();
  const activeNav = new URLSearchParams(location.search).get("nav") ?? "";
  const isConditionsPage = location.pathname === "/diseases" || location.pathname.startsWith("/disease/");
  const isProfilePage = location.pathname === "/profile";

  return (
    <header className="site-header">
      <Link className="site-logo" to="/">
        <img className="site-logo-img" src={sealaraLogo} alt="" decoding="async" />
        <span className="site-logo-text">Sealara</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        {NAV_ITEMS.map(({ id, label, to }) => {
          const isActive =
            id === "conditions" ? isConditionsPage : id === "profile" ? isProfilePage : activeNav === id;
          return (
            <Link
              key={id}
              to={to}
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
