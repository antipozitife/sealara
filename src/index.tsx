import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { ConsoleErrorRedirect } from "./components/ConsoleErrorRedirect.tsx";
import { DiseaseDetailPage } from "./pages/Disease/DiseaseDetailPage.tsx";
import { DiseasesPage } from "./pages/Diseases/DiseasesPage.tsx";
import { DoctorsPage } from "./pages/Doctors/DoctorsPage.tsx";
import { AuthPage } from "./pages/Auth/AuthPage.tsx";
import { DiagnosisPage } from "./pages/Diagnosis/DiagnosisPage.tsx";
import { HttpErrorPageRoute } from "./pages/Error/HttpErrorPage.tsx";
import { HomePage } from "./pages/Home/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFound/NotFoundPage.tsx";
import { ProfilePage } from "./pages/Profile/ProfilePage.tsx";
import "./styles/global.css";

const App = () => (
  <BrowserRouter>
    <ConsoleErrorRedirect />
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/diseases" element={<DiseasesPage />} />
        <Route path="/doctors" element={<DoctorsPage />} />
        <Route path="/disease/:id" element={<DiseaseDetailPage />} />
        <Route path="/diagnosis" element={<DiagnosisPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/error/:code" element={<HttpErrorPageRoute />} />
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/error/404" replace />} />
      </Routes>
    </AppErrorBoundary>
  </BrowserRouter>
);

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
