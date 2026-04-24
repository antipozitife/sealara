import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/Home/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFound/NotFoundPage.tsx";
import "./styles/global.css";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/not-found" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  </BrowserRouter>
);

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
