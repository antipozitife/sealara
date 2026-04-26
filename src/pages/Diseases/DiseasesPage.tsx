import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import diseasesData from "../../data/diseases.json";
import "../../styles/layout-shell.css";
import "./diseases.css";

type DiseaseRaw = Record<string, string | number | undefined>;

type DiseaseEntry = {
  id: number;
  name: string;
  definition: string;
  raw: DiseaseRaw;
};

const diseases = diseasesData as DiseaseEntry[];

function getImageSrc(raw: DiseaseRaw): string | null {
  const value = raw["картинка"];
  if (value === undefined || value === null) return null;
  const src = String(value).trim();
  if (!src || src === "-") return null;
  return src;
}

export const DiseasesPage: React.FC = () => {
  const [query, setQuery] = useState("");

  const filteredDiseases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return diseases;
    return diseases.filter((d) => d.name.toLowerCase().includes(normalized));
  }, [query]);

  return (
    <div className="shell diseases-page">
      <Header />

      <main className="diseases-main">
        <section className="diseases-hero">
          <h1>Заболевания</h1>
          <p>
            Подборка заболеваний из базы Sealara. Откройте карточку заболевания, чтобы посмотреть симптомы,
            диагностику и рекомендации.
          </p>
          <input
            className="diseases-search"
            type="search"
            placeholder="Поиск по названию заболевания..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Поиск заболевания"
          />
        </section>

        <section className="diseases-grid" aria-label="Список заболеваний">
          {filteredDiseases.map((disease) => {
            const imageSrc = getImageSrc(disease.raw);
            return (
              <article key={disease.id} className="disease-card">
                <div className="disease-card-image-slot">
                  {imageSrc ? (
                    <img className="disease-card-image" src={imageSrc} alt={`Иллюстрация: ${disease.name}`} />
                  ) : (
                    <div className="disease-card-image disease-card-image--placeholder" aria-hidden="true" />
                  )}
                </div>
                <h2>{disease.name}</h2>
                <p>{disease.definition}</p>
                <Link className="disease-card-link" to={`/disease/${disease.id}`}>
                  открыть карточку
                </Link>
              </article>
            );
          })}
        </section>

        {filteredDiseases.length === 0 && (
          <div className="diseases-empty">Ничего не найдено. Попробуйте изменить запрос.</div>
        )}
      </main>

      <Footer />
    </div>
  );
};
