import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DiseaseDetailPage } from "./pages/Disease/DiseaseDetailPage.tsx";
import { DiseasesPage } from "./pages/Diseases/DiseasesPage.tsx";
import { AuthPage } from "./pages/Auth/AuthPage.tsx";
import { HomePage } from "./pages/Home/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFound/NotFoundPage.tsx";
import { ProfilePage } from "./pages/Profile/ProfilePage.tsx";
import "./styles/global.css";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/diseases" element={<DiseasesPage />} />
      <Route path="/disease/:id" element={<DiseaseDetailPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/not-found" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/not-found" replace />} />
    </Routes>
  </BrowserRouter>
);

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
