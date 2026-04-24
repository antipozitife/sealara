import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import whyCarouselDiseases from "../../data/whyCarouselDiseases.json";
import "./why-carousel.css";

export type WhyCarouselDisease = {
  id: number;
  disease: string;
  excerpt: string;
};

const defaultItems = whyCarouselDiseases as WhyCarouselDisease[];

type Props = {
  items?: WhyCarouselDisease[];
};

/** Одна строка без абзацев — иначе line-clamp считает пустые строки и многоточие оказывается не на последней видимой строке текста */
function excerptForCarousel(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function shuffleCopy<T>(array: readonly T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const WhyDiseasesCarousel: React.FC<Props> = ({ items = defaultItems }) => {
  const ordered = useMemo(() => shuffleCopy(items), [items]);
  const duplicatedData = [...ordered, ...ordered];

  return (
    <div className="why-carousel-wrapper">
      <div className="why-carousel-track">
        {duplicatedData.map((row, index) => (
          <Link
            className="why-carousel-card"
            to={`/disease/${row.id}`}
            key={`${row.id}-${index}`}
          >
            <span className="why-carousel-card-title">{row.disease}</span>
            <div className="why-carousel-card-body">{excerptForCarousel(row.excerpt)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
};
