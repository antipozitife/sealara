import React from "react";
import { Link } from "react-router-dom";
import "./footer.css";

const CONTACT_EMAIL = "antipozitife@icloud.com";

export const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-col">
        <Link to="/not-found">энциклопедия болезней</Link>
        <Link to="/not-found">диагностика болезней</Link>
        <Link to="/not-found">сборник врачей</Link>
        <Link to="/not-found">мой профиль</Link>
      </div>

      <div className="footer-note">
        Информация, опубликованная на сайте, предназначена только для ознакомления и не заменяет консультацию с
        медицинским специалистом. Обязательно проконсультируйтесь с врачом!
      </div>

      <div className="footer-col right">
        <Link className="footer-contact-link" to="/not-found">
          <span>по всем вопросам и предложениям</span>
          <span>писать на почту</span>
        </Link>
        <a className="footer-contact-email" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </div>
    </footer>
  );
};
