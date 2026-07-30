import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { hasFrontendDemoSession, isFrontendDemo, meOptional } from "../../lib/auth-api";
import sealaraLogo from "../../images/sealara-logo-192.webp";
import "./header.css";

const NAV_ITEMS = [
  { id: "conditions", label: "заболевания", to: "/diseases" },
  { id: "diagnosis", label: "анализ симптомов", to: "/diagnosis" },
  { id: "doctors", label: "врачи", to: "/doctors" },
  { id: "profile", label: "профиль", to: "/profile" },
] as const;

export const Header = () => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    isFrontendDemo ? hasFrontendDemoSession() : false,
  );
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

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
        <img className="site-logo-img" src={sealaraLogo} alt="" decoding="async" width="192" height="192" />
        <span className="site-logo-text">Sealara</span>
      </Link>
      <button
        type="button"
        className={`site-menu-toggle${menuOpen ? " site-menu-toggle--open" : ""}`}
        aria-expanded={menuOpen}
        aria-controls="site-navigation"
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
      </button>

      <nav
        id="site-navigation"
        className={`site-nav${menuOpen ? " site-nav--open" : ""}`}
        aria-label="Основная навигация"
      >
        {NAV_ITEMS.map(({ id, label, to }) => {
          const isLockedForGuests = (id === "doctors" || id === "profile") && !isAuthenticated;
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
                to={`/auth?next=${encodeURIComponent(to)}`}
                title={`Войти, чтобы открыть раздел «${label}»`}
              >
                {label}
                <span className="site-nav-lock" aria-hidden="true">
                  🔒
                </span>
                <span className="visually-hidden"> — требуется вход</span>
              </Link>
            );
          }

          const guestDestination = id === "diagnosis" && !isAuthenticated ? "/diagnosis?mode=demo" : to;

          return (
            <Link
              key={id}
              to={guestDestination}
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
