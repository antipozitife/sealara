import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { meOptional } from "../../lib/auth-api";
import sealaraLogo from "../../images/sealara-logo.png";
import "./header.css";

const NAV_ITEMS = [
  { id: "conditions", label: "заболевания", to: "/diseases" },
  { id: "diagnosis", label: "диагностика", to: "/diagnosis" },
  { id: "doctors", label: "врачи", to: "/doctors" },
  { id: "profile", label: "профиль", to: "/profile" },
] as const;

export const Header = () => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let alive = true;
    const checkAuth = async () => {
      try {
        const session = await meOptional();
        if (alive) setIsAuthenticated(Boolean(session));
      } catch {
        if (alive) setIsAuthenticated(false);
      }
    };
    void checkAuth();
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  const activeNav = new URLSearchParams(location.search).get("nav") ?? "";
  const isConditionsPage = location.pathname === "/diseases" || location.pathname.startsWith("/disease/");
  const isDiagnosisPage = location.pathname === "/diagnosis";
  const isDoctorsPage = location.pathname === "/doctors";
  const isProfilePage = location.pathname === "/profile";

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Перейти к основному содержимому
      </a>
      <Link className="site-logo" to="/">
        <img className="site-logo-img" src={sealaraLogo} alt="" decoding="async" width="360" height="132" />
        <span className="site-logo-text">Sealara</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        {NAV_ITEMS.map(({ id, label, to }) => {
          const isLockedForGuests = (id === "diagnosis" || id === "doctors") && !isAuthenticated;
          const isActive =
            id === "conditions"
              ? isConditionsPage
              : id === "diagnosis"
                ? isDiagnosisPage && !isLockedForGuests
                : id === "doctors"
                  ? isDoctorsPage && !isLockedForGuests
                : id === "profile"
                  ? isProfilePage
                  : activeNav === id;

          if (isLockedForGuests) {
            return (
              <Link
                key={id}
                className="site-nav-link site-nav-link--guest"
                to="/auth"
                title={`Войти, чтобы открыть раздел «${label}»`}
              >
                {label}
                <span className="site-nav-lock" aria-hidden="true">🔒</span>
                <span className="visually-hidden"> — требуется вход</span>
              </Link>
            );
          }

          return (
            <Link
              key={id}
              to={to}
              className={`site-nav-link${isActive ? " site-nav-link--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
};
