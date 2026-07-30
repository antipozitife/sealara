import { useId } from "react";
import { Link } from "react-router-dom";
import sealHappy from "../../images/seal-happy-800.webp";
import sealThinking from "../../images/seal-thinking-500.webp";
import sealWave from "../../images/seal-wave-500.webp";
import { WhyDiseasesCarousel } from "./WhyDiseasesCarousel";
import { useRevealOnIntersection } from "./useHomeEffects";

const CLOUD_PATH_FULL =
  "M2680 9643 c-613 -45 -1162 -247 -1613 -590 -129 -99 -339 -307 -447 -443 -636 -801 -793 -1859 -418 -2805 91 -230 262 -523 424 -725 440 -550 1238 -925 2129 -1000 73 -6 667 -10 1530 -10 l1410 0 2035 -2035 c1691 -1691 2040 -2035 2062 -2035 32 0 71 45 66 75 -3 11 -599 912 -1326 2002 -727 1091 -1322 1985 -1322 1988 0 2 678 6 1508 8 1484 3 1509 3 1637 24 779 128 1379 459 1819 1004 174 215 360 544 455 804 205 559 225 1181 54 1745 -194 643 -610 1200 -1155 1546 -295 187 -647 324 -1010 394 -309 59 24 54 -4063 55 -2051 1 -3750 0 -3775 -2z m7595 -148 c906 -114 1607 -568 2045 -1325 250 -431 378 -983 342 -1472 -15 -199 -28 -286 -72 -472 -147 -623 -572 -1228 -1105 -1575 -374 -243 -815 -391 -1314 -441 -66 -6 -646 -10 -1611 -10 l-1509 0 -20 -27 c-14 -16 -19 -34 -15 -47 3 -12 532 -811 1175 -1776 l1169 -1755 -1802 1802 -1803 1802 -1505 4 c-1481 3 -1507 4 -1656 25 -406 58 -732 156 -1069 322 -434 213 -717 462 -968 852 -208 323 -348 707 -404 1108 -23 171 -23 509 0 680 128 929 702 1710 1525 2075 301 133 709 232 1027 247 28 2 1713 2 3745 1 3348 -2 3707 -4 3825 -18z";
const CLOUD_PATH_OUTER = CLOUD_PATH_FULL.slice(0, CLOUD_PATH_FULL.indexOf(" m7595 -148 "));
const SEAL_INFO_URL = "https://cicon.ru/seritulen-balt.html";

export function HeroSection() {
  const filterId = `speechCloudFi${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { ref: revealRef, visible } = useRevealOnIntersection<HTMLDivElement>();
  return (
    <section className="hero">
      <div className="hero-content">
        <h1>Справочный анализ симптомов</h1>
        <p>
          Структурируйте наблюдения о самочувствии и получите автоматическую подборку справочных материалов
          для обсуждения с врачом.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/diagnosis?mode=demo">
            попробовать справочный анализ
          </Link>
          <a className="btn btn-secondary" href="#how-it-works">
            как это работает
          </a>
        </div>
      </div>
      <div className="hero-side">
        <div ref={revealRef} className={`speech-bubble${visible ? " speech-bubble--visible" : ""}`}>
          <svg
            className="speech-bubble-shape"
            viewBox="0 0 1280 965"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#371c78" floodOpacity="0.14" />
              </filter>
            </defs>
            <g transform="translate(0,965) scale(0.1,-0.1)" filter={`url(#${filterId})`}>
              <path className="speech-bubble-cloud-fill" fill="#ffffff" d={CLOUD_PATH_OUTER} />
              <path
                className="speech-bubble-cloud-outline"
                fill="none"
                stroke="#5d2d79"
                strokeWidth="3"
                vectorEffect="nonScalingStroke"
                d={CLOUD_PATH_FULL}
              />
            </g>
          </svg>
          <div className="speech-bubble-content">
            <span>Привет! Я тюлень Sealara</span>
            <small>Давай структурируем наблюдения перед консультацией со специалистом.</small>
          </div>
        </div>
        <div className="hero-seal-slot">
          <a href={SEAL_INFO_URL} target="_blank" rel="noreferrer">
            <img
              className="hero-seal-image"
              src={sealWave}
              alt="Тюлень машет лапкой"
              width="500"
              height="500"
              decoding="async"
            />
          </a>
        </div>
      </div>
    </section>
  );
}

export function WhySection() {
  return (
    <section className="why" id="how-it-works">
      <h2>Почему стоит выбрать именно меня?</h2>
      <div className="why-layout">
        <div className="why-visual">
          <div className="blob blob--why">
            <a href={SEAL_INFO_URL} target="_blank" rel="noreferrer">
              <img
                className="why-blob-seal"
                src={sealThinking}
                alt="Задумчивый тюлень Sealara"
                width="500"
                height="521"
                loading="lazy"
                decoding="async"
              />
            </a>
          </div>
        </div>
        <div className="why-carousel-column">
          <h3 className="why-lead-subtitle">1. Большая база данных заболеваний</h3>
          <WhyDiseasesCarousel />
        </div>
      </div>
    </section>
  );
}

export function BenefitsSection() {
  const markerId = `benefitsArm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { ref: revealRef, visible } = useRevealOnIntersection<HTMLDivElement>();
  return (
    <section className="benefits">
      <div ref={revealRef} className={`benefits-reveal${visible ? " benefits-reveal--visible" : ""}`}>
        <div className="benefits-title">
          <p className="why-lead-subtitle">2. Программа основана на машинном обучении, что обеспечивает</p>
        </div>
        <div className="benefits-arrows" aria-hidden="true">
          <svg className="benefits-arrows-svg" viewBox="0 0 100 30" preserveAspectRatio="xMidYMax meet">
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6.5"
                markerHeight="6.5"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(95, 28, 135, 0.82)" />
              </marker>
            </defs>
            {[25, 75].map((x) => (
              <path
                key={x}
                className="benefits-arrows-path"
                d={`M ${x} 2 L ${x} 24`}
                fill="none"
                stroke="rgba(95, 28, 135, 0.72)"
                strokeWidth="2.25"
                markerEnd={`url(#${markerId})`}
              />
            ))}
          </svg>
        </div>
      </div>
      <div className="benefits-grid">
        <BenefitCard icon="⚡" title="Быстрый результат">
          Получите автоматическую справочную подборку по введённым данным. Она не является медицинским
          заключением.
        </BenefitCard>
        <BenefitCard icon="🕒" title="24/7 Доступность">
          Справочный сервис доступен круглосуточно. При срочных симптомах используйте экстренные службы, а не
          приложение.
        </BenefitCard>
      </div>
    </section>
  );
}

function BenefitCard({ icon, title, children }: { icon: string; title: string; children: string }) {
  return (
    <article className="benefit-card">
      <div className="benefit-card-header">
        <div className="benefit-icon">{icon}</div>
        <h3>{title}</h3>
      </div>
      <p>{children}</p>
    </article>
  );
}

export function CallToActionSection() {
  return (
    <section className="cta">
      <div className="cta-figure">
        <div className="cta-seal-circle" aria-hidden="true" />
        <a href={SEAL_INFO_URL} target="_blank" rel="noreferrer">
          <img
            className="cta-seal-happy"
            src={sealHappy}
            alt="Радостный тюлень Sealara"
            width="800"
            height="857"
            loading="lazy"
            decoding="async"
          />
        </a>
      </div>
      <div className="cta-oval-shell">
        <div className="cta-oval">
          <div className="cta-oval-inner">
            <h2>Хотите подготовить список наблюдений?</h2>
            <p>Пройдите справочный опрос и сохраните результат для разговора с врачом.</p>
            <Link className="btn btn-primary" to="/diagnosis?mode=demo">
              открыть справочный опрос
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
