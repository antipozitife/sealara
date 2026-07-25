import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary.tsx";
import { ConsoleErrorRedirect } from "./components/ConsoleErrorRedirect.tsx";
import "./styles/global.css";

const HomePage = lazy(() => import("./pages/Home/HomePage").then((module) => ({ default: module.HomePage })));
const AuthPage = lazy(() => import("./pages/Auth/AuthPage").then((module) => ({ default: module.AuthPage })));
const DiseasesPage = lazy(() =>
  import("./pages/Diseases/DiseasesPage").then((module) => ({ default: module.DiseasesPage })),
);
const DiseaseDetailPage = lazy(() =>
  import("./pages/Disease/DiseaseDetailPage").then((module) => ({ default: module.DiseaseDetailPage })),
);
const DiagnosisPage = lazy(() =>
  import("./pages/Diagnosis/DiagnosisPage").then((module) => ({ default: module.DiagnosisPage })),
);
const DoctorsPage = lazy(() =>
  import("./pages/Doctors/DoctorsPage").then((module) => ({ default: module.DoctorsPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/Profile/ProfilePage").then((module) => ({ default: module.ProfilePage })),
);
const HttpErrorPageRoute = lazy(() =>
  import("./pages/Error/HttpErrorPage").then((module) => ({ default: module.HttpErrorPageRoute })),
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFound/NotFoundPage").then((module) => ({ default: module.NotFoundPage })),
);

const PageLoader = () => (
  <div className="page-loader" role="status" aria-live="polite">
    <span className="page-loader__spinner" aria-hidden="true" />
    Загружаем страницу…
  </div>
);

const App = () => (
  <BrowserRouter>
    <ConsoleErrorRedirect />
    <AppErrorBoundary>
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </AppErrorBoundary>
  </BrowserRouter>
);

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
