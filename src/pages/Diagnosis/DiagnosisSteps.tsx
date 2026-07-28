import { Link } from "react-router-dom";
import { StateMessage } from "../../components/ui/StateMessage";
import type { DiagnosisFlow } from "./useDiagnosisFlow";

const TEXT_OPTIONS = [
  { value: "none", label: "Пока не могу описать точнее" },
  { value: "mild", label: "Скорее слабые проявления" },
  { value: "severe", label: "Скорее выраженные проявления" },
];

export function QuestionsStep({ flow }: { flow: DiagnosisFlow }) {
  const question = flow.currentQuestion;
  return (
    <section className="diagnosis-card">
      <h1>Ответьте на вопросы, чтобы структурировать наблюдения и получить справочную подборку.</h1>
      <div className="diagnosis-selected">
        Вопрос {Math.min(flow.questionIdx + 1, flow.questions.length)} из {flow.questions.length}
      </div>
      {question && (
        <article className="diagnosis-result">
          <h3 className="diagnosis-question-title">{question.question}</h3>
          {(question.type === "single" || question.type === "text") && (
            <div className="diagnosis-clarify-list">
              {(question.type === "text" ? TEXT_OPTIONS : question.options || []).map((option) => (
                <label key={option.value} className="diagnosis-symptom">
                  <input
                    type="radio"
                    name={question.id}
                    checked={flow.answers[question.id] === option.value}
                    onChange={() => void flow.applyAnswerAndAdvance(question.id, option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          )}
          {question.type === "multi" && question.options && (
            <div className="diagnosis-clarify-list">
              {question.options.map((option) => {
                const current = Array.isArray(flow.answers[question.id])
                  ? (flow.answers[question.id] as string[])
                  : [];
                return (
                  <label key={option.value} className="diagnosis-symptom">
                    <input
                      type="checkbox"
                      checked={current.includes(option.value)}
                      onChange={() => {
                        let next: string[];
                        if (current.includes(option.value))
                          next = current.filter((value) => value !== option.value);
                        else if (question.id === "additional_systems" && option.value === "none")
                          next = ["none"];
                        else if (question.id === "additional_systems")
                          next = [...current.filter((value) => value !== "none"), option.value];
                        else next = [...current, option.value];
                        flow.setAnswer(question.id, next);
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </article>
      )}
      {flow.error && (
        <StateMessage tone="error" className="diagnosis-error">
          {flow.error}
        </StateMessage>
      )}
      <div className="diagnosis-toolbar">
        <button
          type="button"
          className="diagnosis-btn"
          onClick={flow.goPrevQuestion}
          disabled={flow.questionIdx === 0}
        >
          Назад
        </button>
        {question?.type === "multi" && (
          <button
            type="button"
            className="diagnosis-btn"
            onClick={flow.goNextQuestion}
            disabled={!flow.canGoNext}
          >
            Далее
          </button>
        )}
      </div>
    </section>
  );
}

export function PreliminaryStep({ flow }: { flow: DiagnosisFlow }) {
  return (
    <section className="diagnosis-card">
      <h2>Предварительные справочные совпадения</h2>
      <p>Это автоматическая подборка, а не диагноз. Продолжите, чтобы уточнить введённые наблюдения.</p>
      <div className="diagnosis-results">
        {flow.preliminaryPredictions.map((item) => (
          <article key={item.id} className="diagnosis-result">
            <div className="diagnosis-result-header">
              <h3>{item.name}</h3>
              <span>{Math.round(item.score * 100)}%</span>
            </div>
            <p>{item.definition}</p>
          </article>
        ))}
      </div>
      <button type="button" className="diagnosis-btn" onClick={() => flow.setStep("detailed")}>
        Уточнить наблюдения
      </button>
    </section>
  );
}

export function DetailedStep({ flow }: { flow: DiagnosisFlow }) {
  return (
    <>
      <section className="diagnosis-card">
        <h1>Справочный анализ введённых симптомов</h1>
        <p>
          Модель учитывает симптомы, ответы на опросник выше и персональные признаки. При высокой
          неопределенности система предлагает уточняющие симптомы.
        </p>
        {flow.modelInfo && (
          <div className="diagnosis-model">
            <strong>{flow.modelInfo.name}</strong>
            <span>Деревьев: {flow.modelInfo.estimators}</span>
            <small>{flow.modelInfo.strategy}</small>
          </div>
        )}
        <div className="diagnosis-toolbar">
          <input
            type="search"
            className="diagnosis-search"
            placeholder="Поиск симптома..."
            value={flow.query}
            onChange={(event) => flow.setQuery(event.target.value)}
          />
          <button
            type="button"
            className="diagnosis-btn"
            onClick={() => void flow.submitDetailed()}
            disabled={flow.submitting}
          >
            {flow.submitting ? "Обрабатываем..." : "Сформировать справочную подборку"}
          </button>
        </div>
        <div className="diagnosis-selected">Выбрано симптомов: {flow.selected.length}</div>
        <div className="diagnosis-symptoms-list">
          {flow.filteredSymptoms.map((symptom) => (
            <label key={symptom} className="diagnosis-symptom">
              <input
                type="checkbox"
                checked={flow.selected.includes(symptom)}
                onChange={() => flow.toggleSymptom(symptom)}
              />
              <span>{symptom}</span>
            </label>
          ))}
        </div>
        {flow.error && (
          <StateMessage tone="error" className="diagnosis-error">
            {flow.error}
          </StateMessage>
        )}
      </section>
      <section className="diagnosis-card">
        <h2>Результаты</h2>
        {flow.uncertainty !== null && (
          <p className="diagnosis-uncertainty">
            Текущая неопределенность: <strong>{Math.round(flow.uncertainty * 100)}%</strong>
          </p>
        )}
        {flow.needClarification && flow.clarifyingSymptoms.length > 0 && (
          <div className="diagnosis-clarify">
            <h3>Уточняющие симптомы (активное обучение)</h3>
            <p>Добавьте 1–2 наблюдения и повторите анализ. Это не повышает результат до уровня диагноза.</p>
            <div className="diagnosis-clarify-list">
              {flow.clarifyingSymptoms.map((item) => (
                <button
                  key={item.symptom}
                  type="button"
                  className="diagnosis-clarify-item"
                  onClick={() => flow.addClarifyingSymptom(item.symptom)}
                >
                  + {item.symptom}
                </button>
              ))}
            </div>
          </div>
        )}
        {flow.predictions.length === 0 ? (
          <p className="diagnosis-empty">Пока нет результатов. Выберите симптомы и сформируйте подборку.</p>
        ) : (
          <div className="diagnosis-results">
            {flow.predictions.map((item) => (
              <article key={item.id} className="diagnosis-result">
                <div className="diagnosis-result-header">
                  <h3>{item.name}</h3>
                  <span>{Math.round(item.score * 100)}%</span>
                </div>
                <div className="diagnosis-result-submeta">
                  RF: {Math.round(item.probability * 100)}% | Персонализация:{" "}
                  {Math.round((item.personalization || 0) * 100)}%
                </div>
                <p>{item.definition}</p>
                <div className="diagnosis-result-meta">
                  Специалист:{" "}
                  {item.specialist
                    .split("|")
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .join(", ")}
                </div>
                <Link to={`/disease/${item.id}`}>Открыть карточку заболевания</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
