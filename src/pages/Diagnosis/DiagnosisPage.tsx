import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import "../../styles/layout-shell.css";
import { DetailedStep, PreliminaryStep, QuestionsStep } from "./DiagnosisSteps";
import { DiagnosisConsent } from "./DiagnosisConsent";
import "./diagnosis.css";
import { useDiagnosisFlow } from "./useDiagnosisFlow";

export const DiagnosisPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isDemo = new URLSearchParams(location.search).get("mode") === "demo";
  const [consentAccepted, setConsentAccepted] = useState(false);
  const flow = useDiagnosisFlow({ isDemo, reloadKey: location.key, navigate, enabled: consentAccepted });

  return (
    <div className="shell diagnosis-page">
      <Header />
      <main id="main-content" className={`diagnosis-main${flow.loading ? " diagnosis-loading" : ""}`}>
        {!consentAccepted ? (
          <DiagnosisConsent isDemo={isDemo} onAccept={() => setConsentAccepted(true)} />
        ) : flow.loading ? (
          "Загрузка справочного опроса..."
        ) : (
          <>
            {isDemo && (
              <aside className="diagnosis-demo-banner" aria-label="Демонстрационный режим">
                <div>
                  <strong>Деморежим</strong>
                  <span>
                    {" "}
                    Без регистрации: результаты не сохраняются, персональные данные не используются.
                  </span>
                </div>
                <Link to="/auth?next=%2Fdiagnosis">Войти для режима с историей</Link>
              </aside>
            )}
            {flow.step === "questions" && <QuestionsStep flow={flow} />}
            {flow.step === "preliminary" && <PreliminaryStep flow={flow} />}
            {flow.step === "detailed" && <DetailedStep flow={flow} />}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};
