import React, { useLayoutEffect, useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Header } from "../../components/header/Header";
import diseasesData from "../../data/diseases.json";
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
  { rawKey: "определение", title: "Определение" },
  { rawKey: "о заболевании", title: "О заболевании" },
  { rawKey: "симптомы", title: "Симптомы" },
  { rawKey: "лабораторные показатели", title: "Лабораторные показатели" },
  { rawKey: "причины", title: "Причины" },
  { rawKey: "диагностика", title: "Диагностика" },
  { rawKey: "лечение", title: "Лечение" },
  { rawKey: "профилактика", title: "Профилактика" },
  { rawKey: "реабилитация", title: "Реабилитация" },
  { rawKey: "специалист", title: "Специалист" },
  { rawKey: "пол", title: "Пол" },
  { rawKey: "возраст", title: "Возраст" },
  { rawKey: "территории", title: "Территории" },
];

function rawText(raw: DiseaseRaw, key: string): string {
  const v = raw[key];
  if (v === undefined || v === null) return "";
  return String(v).trim();
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

  return (
    <div className="shell disease-page">
      <Header />

      <main className="disease-main">
        <nav className="disease-back">
          <Link to="/">← на главную</Link>
        </nav>

        <article className="disease-article">
          <h1 className="disease-title">{disease.name}</h1>

          {SECTIONS.map(({ rawKey, title }) => {
            const body = rawText(raw, rawKey);
            if (!body) return null;
            return (
              <section className="disease-section" key={rawKey}>
                <h2>{title}</h2>
                <div className="disease-body">{body}</div>
              </section>
            );
          })}
        </article>
      </main>
    </div>
  );
};
