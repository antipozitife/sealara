import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const THROTTLE_MS = 1200;

/**
 * При необработанной ошибке JS или отклонённом Promise перенаправляет на `/error/500`
 * (не реагирует на ошибки, уже попавшие на страницу /error/*).
 */
export const ConsoleErrorRedirect: React.FC = () => {
  const navigate = useNavigate();
  const lastNav = useRef(0);

  useEffect(() => {
    const go = () => {
      const path = window.location.pathname;
      if (path.startsWith("/error")) return;
      const now = Date.now();
      if (now - lastNav.current < THROTTLE_MS) return;
      lastNav.current = now;
      navigate("/error/500", { replace: true });
    };

    /** Только исключения в JS; не <img>/script 404 (event.target — элемент, не window). */
    const onWindowError = (event: Event) => {
      const t = event.target;
      if (t != null && t !== window) return;
      go();
    };
    const onRejection = () => go();

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [navigate]);

  return null;
};
