import { useState } from "react";
import { MedicalNotice } from "../../components/MedicalNotice";

export function DiagnosisConsent({ isDemo, onAccept }: { isDemo: boolean; onAccept: () => void }) {
  const [adult, setAdult] = useState(false);
  const [limitations, setLimitations] = useState(false);
  const [dataProcessing, setDataProcessing] = useState(false);
  const accepted = adult && limitations && dataProcessing;

  return (
    <section className="diagnosis-card diagnosis-consent">
      <h1>Перед началом</h1>
      <MedicalNotice />
      <div className="diagnosis-clarify-list">
        <label className="diagnosis-symptom">
          <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
          <span>Мне исполнилось 18 лет.</span>
        </label>
        <label className="diagnosis-symptom">
          <input
            type="checkbox"
            checked={limitations}
            onChange={(event) => setLimitations(event.target.checked)}
          />
          <span>
            Я понимаю, что результат является автоматической справочной подборкой, не диагнозом и не
            основанием для самолечения или отказа от обращения к врачу.
          </span>
        </label>
        <label className="diagnosis-symptom">
          <input
            type="checkbox"
            checked={dataProcessing}
            onChange={(event) => setDataProcessing(event.target.checked)}
          />
          <span>
            Я явно соглашаюсь на обработку введённых сведений о симптомах для формирования справочного
            результата
            {isDemo
              ? "; в деморежиме результат не сохраняется в профиле."
              : "; в полном режиме запрос может быть сохранён в истории аккаунта."}
          </span>
        </label>
      </div>
      <button type="button" className="diagnosis-btn" disabled={!accepted} onClick={onAccept}>
        Продолжить к справочному анализу
      </button>
    </section>
  );
}
