import React from "react";
import { Link } from "react-router-dom";
import "./footer.css";

const CONTACT_EMAIL = "antipozitife@icloud.com";

export const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-col">
        <Link to="/diseases">энциклопедия болезней</Link>
        <Link to="/diagnosis?mode=demo">справочный анализ симптомов</Link>
        <Link to="/doctors">поиск специалиста</Link>
        <Link to="/profile">мой профиль</Link>
      </div>

      <div className="footer-note">
        Учебный сервис. Не оказывает медицинские услуги, не устанавливает диагноз и не назначает лечение.
        Автоматические результаты могут быть ошибочными. При угрозе жизни звоните 112 или 103.
      </div>

      <div className="footer-col right">
        <a className="footer-contact-link" href={`mailto:${CONTACT_EMAIL}?subject=Sealara — обратная связь`}>
          <span>по всем вопросам и предложениям</span>
          <span>писать на почту</span>
        </a>
        <a className="footer-contact-email" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
};
