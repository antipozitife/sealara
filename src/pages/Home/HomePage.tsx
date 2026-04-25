import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import sealHappy from "../../images/seal-happy.png";
import sealThinking from "../../images/seal-thinking.png";
import sealWave from "../../images/seal-wave.png";
import "../../styles/layout-shell.css";
import { WhyDiseasesCarousel } from "./WhyDiseasesCarousel";
import "./home.css";

/** Potrace: два подпути в одном `d` дают «дырку» при одной заливке (nonzero). Обводка — полный путь, заливка — только внешний контур. */
const CLOUD_PATH_FULL =
  "M2680 9643 c-613 -45 -1162 -247 -1613 -590 -129 -99 -339 -307 -447 -443 -636 -801 -793 -1859 -418 -2805 91 -230 262 -523 424 -725 440 -550 1238 -925 2129 -1000 73 -6 667 -10 1530 -10 l1410 0 2035 -2035 c1691 -1691 2040 -2035 2062 -2035 32 0 71 45 66 75 -3 11 -599 912 -1326 2002 -727 1091 -1322 1985 -1322 1988 0 2 678 6 1508 8 1484 3 1509 3 1637 24 779 128 1379 459 1819 1004 174 215 360 544 455 804 205 559 225 1181 54 1745 -194 643 -610 1200 -1155 1546 -295 187 -647 324 -1010 394 -309 59 24 54 -4063 55 -2051 1 -3750 0 -3775 -2z m7595 -148 c906 -114 1607 -568 2045 -1325 250 -431 378 -983 342 -1472 -15 -199 -28 -286 -72 -472 -147 -623 -572 -1228 -1105 -1575 -374 -243 -815 -391 -1314 -441 -66 -6 -646 -10 -1611 -10 l-1509 0 -20 -27 c-14 -16 -19 -34 -15 -47 3 -12 532 -811 1175 -1776 l1169 -1755 -1802 1802 -1803 1802 -1505 4 c-1481 3 -1507 4 -1656 25 -406 58 -732 156 -1069 322 -434 213 -717 462 -968 852 -208 323 -348 707 -404 1108 -23 171 -23 509 0 680 128 929 702 1710 1525 2075 301 133 709 232 1027 247 28 2 1713 2 3745 1 3348 -2 3707 -4 3825 -18z";

const CLOUD_PATH_OUTER = CLOUD_PATH_FULL.slice(0, CLOUD_PATH_FULL.indexOf(" m7595 -148 "));

const HOME_SCROLL_KEY = "sealara-home-scroll-y";

export const HomePage = () => {
  const cloudFilterId = `speechCloudFi${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const benefitsArrowMarkerId = `benefitsArm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const speechBubbleRef = useRef<HTMLDivElement>(null);
  const benefitsRevealRef = useRef<HTMLDivElement>(null);
  const [speechBubbleVisible, setSpeechBubbleVisible] = useState(false);
  const [benefitsRevealVisible, setBenefitsRevealVisible] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(HOME_SCROLL_KEY);
    if (raw === null) return;
    const y = Number.parseInt(raw, 10);
    if (!Number.isFinite(y) || y < 0) return;
    const apply = () => window.scrollTo(0, y);
    apply();
    requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });
  }, []);

  /* Сохранять в layout cleanup: иначе после перехода на другую страницу useEffect сработает уже при scrollY === 0 */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    return () => {
      sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY));
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf = 0;
    const persist = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sessionStorage.setItem(HOME_SCROLL_KEY, String(window.scrollY));
      });
    };
    window.addEventListener("scroll", persist, { passive: true });
    return () => window.removeEventListener("scroll", persist);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSpeechBubbleVisible(true);
      return;
    }

    const el = speechBubbleRef.current;
    if (!el) return;

    let showRaf = 0;

    const scheduleShow = () => {
      cancelAnimationFrame(showRaf);
      /* Два кадра: сначала отрисовка opacity:0, затем класс — иначе transition не виден (и при открытии, и при прокрутке к блоку). */
      showRaf = requestAnimationFrame(() => {
        showRaf = requestAnimationFrame(() => {
          setSpeechBubbleVisible(true);
        });
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          cancelAnimationFrame(showRaf);
          setSpeechBubbleVisible(false);
          return;
        }
        scheduleShow();
      },
      { threshold: 0.08, rootMargin: "0px" }
    );

    io.observe(el);
    return () => {
      cancelAnimationFrame(showRaf);
      io.disconnect();
    };
  }, []);

  /* Как у речевого облака: появление при входе блока в зону видимости, уход — снова скрыт */
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBenefitsRevealVisible(true);
      return;
    }

    const el = benefitsRevealRef.current;
    if (!el) return;

    let showRaf = 0;

    const scheduleShow = () => {
      cancelAnimationFrame(showRaf);
      showRaf = requestAnimationFrame(() => {
        showRaf = requestAnimationFrame(() => {
          setBenefitsRevealVisible(true);
        });
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          cancelAnimationFrame(showRaf);
          setBenefitsRevealVisible(false);
          return;
        }
        scheduleShow();
      },
      { threshold: 0.08, rootMargin: "0px" }
    );

    io.observe(el);
    return () => {
      cancelAnimationFrame(showRaf);
      io.disconnect();
    };
  }, []);

  return (
    <div className="shell">
      <Header />

      <main>
        <section className="hero">
          <div className="hero-content">
            <h1>Интеллектуальная система здоровья</h1>
            <p>
              Определите возможные заболевания по симптомам и получите рекомендации по записи к специалисту.
              Современные алгоритмы машинного обучения для вашего здоровья.
            </p>

            <div className="hero-actions">
              <Link className="btn btn-primary" to="/not-found">
                начать диагностику
              </Link>
              <Link className="btn btn-secondary" to="/not-found">
                узнать подробнее
              </Link>
            </div>
          </div>

          <div className="hero-side">
            <div
              ref={speechBubbleRef}
              className={`speech-bubble${speechBubbleVisible ? " speech-bubble--visible" : ""}`}
            >
              <svg
                className="speech-bubble-shape"
                viewBox="0 0 1280 965"
                preserveAspectRatio="xMidYMid meet"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <filter
                    id={cloudFilterId}
                    x="-8%"
                    y="-8%"
                    width="116%"
                    height="116%"
                    colorInterpolationFilters="sRGB"
                  >
                    <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#371c78" floodOpacity="0.14" />
                  </filter>
                </defs>
                <g transform="translate(0,965) scale(0.1,-0.1)" filter={`url(#${cloudFilterId})`}>
                  <path className="speech-bubble-cloud-fill" fill="#ffffff" d={CLOUD_PATH_OUTER} />
                  <path
                    className="speech-bubble-cloud-outline"
                    fill="none"
                    stroke="#5d2d79"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="nonScalingStroke"
                    d={CLOUD_PATH_FULL}
                  />
                </g>
              </svg>
              <div className="speech-bubble-content">
                <span>Привет! Я тюлень Sealara</span>
                <small>Давай помашем лапкой и начнем диагностику вместе.</small>
              </div>
            </div>

            <div className="hero-seal-slot">
              <img className="hero-seal-image" src={sealWave} alt="Тюлень машет лапкой" />
            </div>
          </div>
        </section>

        <section className="why">
          <h2>Почему стоит выбрать именно меня?</h2>

          <div className="why-layout">
            <div className="why-visual">
              <div className="blob blob--why">
                <img className="why-blob-seal" src={sealThinking} alt="Задумчивый тюлень Sealara" />
              </div>
            </div>

            <div className="why-carousel-column">
              <h3 className="why-lead-subtitle">1. Большая база данных заболеваний</h3>
              <WhyDiseasesCarousel />
            </div>
          </div>
        </section>

        <section className="benefits">
          <div
            ref={benefitsRevealRef}
            className={`benefits-reveal${benefitsRevealVisible ? " benefits-reveal--visible" : ""}`}
          >
            <div className="benefits-title">
              <p className="why-lead-subtitle">2. Программа основана на машинном обучении, что обеспечивает</p>
            </div>

            <div className="benefits-arrows" aria-hidden="true">
              <svg
                className="benefits-arrows-svg"
                viewBox="0 0 100 30"
                preserveAspectRatio="xMidYMax meet"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <marker
                    id={benefitsArrowMarkerId}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6.5"
                    markerHeight="6.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(95, 28, 135, 0.82)" />
                  </marker>
                </defs>
                <path
                  className="benefits-arrows-path"
                  d="M 25 2 L 25 24"
                  fill="none"
                  stroke="rgba(95, 28, 135, 0.72)"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={`url(#${benefitsArrowMarkerId})`}
                />
                <path
                  className="benefits-arrows-path"
                  d="M 75 2 L 75 24"
                  fill="none"
                  stroke="rgba(95, 28, 135, 0.72)"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={`url(#${benefitsArrowMarkerId})`}
                />
              </svg>
            </div>
          </div>

          <div className="benefits-grid">
            <article className="benefit-card">
              <div className="benefit-card-header">
                <div className="benefit-icon">⚡</div>
                <h3>Быстрый результат</h3>
              </div>
              <p>
                Получите предварительный диагноз за 2–3 минуты. Система мгновенно обрабатывает данные и выдаёт
                рекомендации.
              </p>
            </article>

            <article className="benefit-card">
              <div className="benefit-card-header">
                <div className="benefit-icon">🕒</div>
                <h3>24/7 Доступность</h3>
              </div>
              <p>
                Система работает круглосуточно. Проверьте своё здоровье в любое удобное время, не выходя из дома.
              </p>
            </article>
          </div>
        </section>

        <section className="cta">
          <div className="cta-figure">
            <div className="cta-seal-circle" aria-hidden="true" />
            <img className="cta-seal-happy" src={sealHappy} alt="Радостный тюлень Sealara" />
          </div>

          <div className="cta-oval-shell">
            <div className="cta-oval">
              <div className="cta-oval-inner">
                <h2>Готовы проверить своё здоровье?</h2>
                <p>Начните диагностику прямо сейчас и получите персональные рекомендации от Sealara.</p>
                <Link className="btn btn-primary" to="/not-found">
                  начать диагностику
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};
