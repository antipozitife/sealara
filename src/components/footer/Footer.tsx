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
        <Link to="/not-found">по всем вопросам</Link>
        <a href={`mailto:${CONTACT_EMAIL}`}>писать на почту</a>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </div>
    </footer>
  );
};
