import React, { useLayoutEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import diseasesData from "../../data/diseases.json";
import sealReading from "../../images/seal-reading.png";
import "../../styles/layout-shell.css";
import "./disease.css";

type DiseaseRaw = Record<string, string | number | undefined>;

export type DiseaseEntry = {
  id: number;
  name: string;
  definition: string;
  raw: DiseaseRaw;
};

const diseases = diseasesData as DiseaseEntry[];

const SECTIONS: { rawKey: string; title: string }[] = [
  { rawKey: "о заболевании", title: "О заболевании" },
  { rawKey: "симптомы", title: "Симптомы" },
  { rawKey: "лабораторные показатели", title: "Лабораторные показатели" },
  { rawKey: "причины", title: "Причины" },
  { rawKey: "диагностика", title: "Диагностика" },
  { rawKey: "лечение", title: "Лечение" },
  { rawKey: "профилактика", title: "Профилактика" },
  { rawKey: "реабилитация", title: "Реабилитация" },
  { rawKey: "специалист", title: "Специалист" },
];

function rawText(raw: DiseaseRaw, key: string): string {
  const v = raw[key];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function imageSrcFromRaw(raw: DiseaseRaw): string | null {
  const image = rawText(raw, "картинка");
  if (!image || image === "-") return null;
  return image;
}

function parsePipeSeparatedList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function withTrailingPunctuation(text: string, isLast: boolean): string {
  const normalized = text.replace(/[;,.]+$/g, "").trim();
  return `${normalized}${isLast ? "." : ";"}`;
}

function excerptForCard(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

export const DiseaseDetailPage: React.FC = () => {
  const { id: idParam } = useParams<{ id: string }>();
  const id = idParam ? Number.parseInt(idParam, 10) : NaN;

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [idParam]);

  const disease = useMemo(() => {
    if (!Number.isFinite(id) || id < 1) return undefined;
    return diseases.find((d) => d.id === id);
  }, [id]);

  if (!Number.isFinite(id) || id < 1) {
    return <Navigate to="/not-found" replace />;
  }

  if (!disease) {
    return <Navigate to="/not-found" replace />;
  }

  const raw = disease.raw as DiseaseRaw;
  const imageSrc = imageSrcFromRaw(raw);
  const definition = excerptForCard(rawText(raw, "определение"));

  return (
    <div className="shell disease-page">
      <Header />

      <main className="disease-main">
        <nav className="disease-back">
          <Link to="/diseases">← к списку заболеваний</Link>
        </nav>

        <article className="disease-article">
          <h1 className="disease-title">{disease.name}</h1>

          {definition && (
            <section className="disease-section disease-section--lead disease-section--definition">
              <h2>Определение</h2>
              <div className="disease-definition-layout">
                <div className="disease-body disease-body--clamped">{definition}</div>
                {imageSrc && <img className="disease-definition-image" src={imageSrc} alt={`Иллюстрация: ${disease.name}`} />}
              </div>
            </section>
          )}

          {SECTIONS.map(({ rawKey, title }) => {
            const body = rawText(raw, rawKey);
            if (!body) return null;

            if (rawKey === "о заболевании") {
              return (
                <section className="disease-section disease-section--about" key={rawKey}>
                  <h2>{title}</h2>
                  <div className="disease-about-layout">
                    <img className="disease-about-seal" src={sealReading} alt="Тюлень Sealara читает книгу" />
                    <div className="disease-body disease-body--clamped">{excerptForCard(body)}</div>
                  </div>
                </section>
              );
            }

            if (rawKey === "симптомы") {
              const symptoms = parsePipeSeparatedList(body);
              return (
                <section className="disease-section" key={rawKey}>
                  <h2>{title}</h2>
                  {symptoms.length > 0 ? (
                    <ul className="disease-symptoms-list">
                      {symptoms.map((symptom, index) => (
                        <li key={`${symptom}-${index}`}>
                          {withTrailingPunctuation(symptom, index === symptoms.length - 1)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="disease-body disease-body--clamped">{excerptForCard(body)}</div>
                  )}
                </section>
              );
            }

            if (rawKey === "лабораторные показатели") {
              const changes = parsePipeSeparatedList(body);
              return (
                <section className="disease-section" key={rawKey}>
                  <h2>В лабораторных показателях заметны следующие изменения:</h2>
                  {changes.length > 0 ? (
                    <ul className="disease-symptoms-list">
                      {changes.map((change, index) => (
                        <li key={`${change}-${index}`}>
                          {withTrailingPunctuation(change, index === changes.length - 1)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="disease-body disease-body--clamped">{excerptForCard(body)}</div>
                  )}
                </section>
              );
            }

            if (rawKey === "специалист") {
              const specialists = parsePipeSeparatedList(body);
              const rendered =
                specialists.length > 0
                  ? specialists.join(", ")
                  : body
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .join(", ");

              return (
                <section className="disease-section" key={rawKey}>
                  <h2>{title}</h2>
                  <div className="disease-body disease-body--clamped">{excerptForCard(rendered)}</div>
                </section>
              );
            }

            return (
              <section className="disease-section" key={rawKey}>
                <h2>{title}</h2>
                <div className="disease-body disease-body--clamped">{excerptForCard(body)}</div>
              </section>
            );
          })}
        </article>
      </main>

      <Footer />
    </div>
  );
};
