import React from "react";
import { Link } from "react-router-dom";
import "./footer.css";

const CONTACT_EMAIL = "antipozitife@icloud.com";

export const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-col">
        <Link to="/diseases">энциклопедия болезней</Link>
        <Link to="/diagnosis">диагностика болезней</Link>
        <Link to="/doctors">сборник врачей</Link>
        <Link to="/profile">мой профиль</Link>
      </div>

      <div className="footer-note">
        Информация, опубликованная на сайте, предназначена только для ознакомления и не заменяет консультацию с
        медицинским специалистом. Обязательно проконсультируйтесь с врачом!
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
