import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Footer } from "../../components/footer/Footer";
import { Header } from "../../components/header/Header";
import {
  diagnose,
  diagnosisOptions,
  diagnosisQuestions,
  preliminaryDiagnosis,
  DiagnosisPrediction,
  DiagnosisQuestion,
  meOptional,
} from "../../lib/auth-api";
import "../../styles/layout-shell.css";
import "./diagnosis.css";

export const DiagnosisPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<"questions" | "preliminary" | "detailed">("questions");
  const [questions, setQuestions] = useState<DiagnosisQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [questionIdx, setQuestionIdx] = useState(0);
  const [preliminaryPredictions, setPreliminaryPredictions] = useState<DiagnosisPrediction[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [predictions, setPredictions] = useState<DiagnosisPrediction[]>([]);
  const [uncertainty, setUncertainty] = useState<number | null>(null);
  const [needClarification, setNeedClarification] = useState(false);
  const [clarifyingSymptoms, setClarifyingSymptoms] = useState<Array<{ symptom: string; infoGain: number }>>([]);
  const [modelInfo, setModelInfo] = useState<{ name: string; estimators: number; strategy: string } | null>(null);
  const [round, setRound] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const session = await meOptional();
        if (!session) {
          navigate("/auth");
          return;
        }
        const [questionsData, symptomsData] = await Promise.all([diagnosisQuestions(), diagnosisOptions()]);
        setQuestions(questionsData.questions);
        setSymptoms(symptomsData.symptoms);
      } catch {
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };
    void load();
    // location.key меняется при каждом заходе на маршрут — подтягиваем свежий KEY_QUESTIONS с API
  }, [navigate, location.key]);

  const filteredSymptoms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return symptoms;
    return symptoms.filter((item) => item.toLowerCase().includes(normalized));
  }, [symptoms, query]);

  const toggleSymptom = (symptom: string) => {
    setSelected((prev) => (prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]));
  };

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const currentQuestion = questions[questionIdx];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const canGoNext = useMemo(() => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === "multi") {
      return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    }
    return currentAnswer !== undefined && currentAnswer !== null && String(currentAnswer).trim() !== "";
  }, [currentAnswer, currentQuestion]);

  const setTextQuestionPreset = (questionId: string, value: string) => {
    setAnswer(questionId, value);
  };

  const goNextQuestion = () => {
    if (!canGoNext) return;
    setQuestionIdx((prev) => Math.min(prev + 1, Math.max(questions.length - 1, 0)));
  };

  const goPrevQuestion = () => {
    setQuestionIdx((prev) => Math.max(prev - 1, 0));
  };

  const applyAnswerAndAdvance = async (questionId: string, value: unknown) => {
    setAnswer(questionId, value);
    const isLast = questionIdx >= questions.length - 1;
    if (isLast) {
      const nextAnswers = { ...answers, [questionId]: value };
      setSubmitting(true);
      setError("");
      try {
        const response = await preliminaryDiagnosis({ answers: nextAnswers });
        setPreliminaryPredictions(response.predictions || []);
        if (Array.isArray(response.relevantSymptoms) && response.relevantSymptoms.length > 0) {
          const allowed = new Set(symptoms);
          const shortlist = response.relevantSymptoms.filter((s) => allowed.has(s));
          if (shortlist.length > 0) setSelected(shortlist.slice(0, 8));
        }
        setStep("preliminary");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось получить предварительный результат");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setQuestionIdx((prev) => Math.min(prev + 1, Math.max(questions.length - 1, 0)));
  };

  const submitQuestions = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await preliminaryDiagnosis({ answers });
      setPreliminaryPredictions(response.predictions || []);
      if (Array.isArray(response.relevantSymptoms) && response.relevantSymptoms.length > 0) {
        const allowed = new Set(symptoms);
        const shortlist = response.relevantSymptoms.filter((s) => allowed.has(s));
        if (shortlist.length > 0) setSelected(shortlist.slice(0, 8));
      }
      setStep("preliminary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить предварительный результат");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (selected.length === 0) {
      setError("Выберите хотя бы один симптом");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await diagnose({ symptoms: selected, round, answers });
      setPredictions(response.predictions);
      setUncertainty(response.uncertainty);
      setNeedClarification(response.needClarification);
      setClarifyingSymptoms(response.clarifyingSymptoms || []);
      setModelInfo(response.modelInfo || null);
      setRound((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить прогноз");
    } finally {
      setSubmitting(false);
    }
  };

  const addClarifyingSymptom = (symptom: string) => {
    setSelected((prev) => (prev.includes(symptom) ? prev : [...prev, symptom]));
  };

  useEffect(() => {
    setRound(1);
  }, [selected.length]);

  if (loading) {
    return (
      <div className="shell diagnosis-page">
        <Header />
        <main className="diagnosis-main diagnosis-loading">Загрузка диагностики...</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="shell diagnosis-page">
      <Header />
      <main className="diagnosis-main">
        {step === "questions" && (
          <section className="diagnosis-card">
            <h1>Ответьте на вопросы, чтобы получить предварительный список заболеваний и релевантные симптомы.</h1>
            <div className="diagnosis-selected">
              Вопрос {Math.min(questionIdx + 1, questions.length)} из {questions.length}
            </div>
            {currentQuestion && (
              <article key={currentQuestion.id} className="diagnosis-result">
                <h3 className="diagnosis-question-title">{currentQuestion.question}</h3>
                {currentQuestion.type === "single" && currentQuestion.options && (
                  <div className="diagnosis-clarify-list">
                    {currentQuestion.options.map((opt) => (
                      <label key={opt.value} className="diagnosis-symptom">
                        <input
                          type="radio"
                          name={currentQuestion.id}
                          checked={answers[currentQuestion.id] === opt.value}
                          onChange={() => void applyAnswerAndAdvance(currentQuestion.id, opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                {currentQuestion.type === "multi" && currentQuestion.options && (
                  <div className="diagnosis-clarify-list">
                    {currentQuestion.options.map((opt) => {
                      const current = Array.isArray(answers[currentQuestion.id])
                        ? (answers[currentQuestion.id] as string[])
                        : [];
                      return (
                        <label key={opt.value} className="diagnosis-symptom">
                          <input
                            type="checkbox"
                            checked={current.includes(opt.value)}
                            onChange={() => {
                              let nextValue: string[];
                              if (current.includes(opt.value)) {
                                nextValue = current.filter((x) => x !== opt.value);
                              } else if (
                                currentQuestion.id === "additional_systems" &&
                                opt.value === "none"
                              ) {
                                nextValue = ["none"];
                              } else if (currentQuestion.id === "additional_systems") {
                                nextValue = [...current.filter((x) => x !== "none"), opt.value];
                              } else {
                                nextValue = [...current, opt.value];
                              }
                              setAnswer(currentQuestion.id, nextValue);
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {currentQuestion.type === "text" && (
                  <div className="diagnosis-clarify-list">
                    {[
                      { value: "none", label: "Пока не могу описать точнее" },
                      { value: "mild", label: "Скорее слабые проявления" },
                      { value: "severe", label: "Скорее выраженные проявления" },
                    ].map((opt) => (
                      <label key={opt.value} className="diagnosis-symptom">
                        <input
                          type="radio"
                          name={currentQuestion.id}
                          checked={answers[currentQuestion.id] === opt.value}
                          onChange={() => void applyAnswerAndAdvance(currentQuestion.id, opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </article>
            )}
            {error && <div className="diagnosis-error">{error}</div>}
            <div className="diagnosis-toolbar">
              <button type="button" className="diagnosis-btn" onClick={goPrevQuestion} disabled={questionIdx === 0}>
                Назад
              </button>
              {currentQuestion?.type === "multi" && (
                <button type="button" className="diagnosis-btn" onClick={goNextQuestion} disabled={!canGoNext}>
                  Далее
                </button>
              )}
            </div>
          </section>
        )}

        {step === "preliminary" && (
          <section className="diagnosis-card">
            <h2>Предварительный результат</h2>
            <p>Ниже топ предварительных гипотез. Нажмите, чтобы перейти к детальному уточнению симптомов.</p>
            <div className="diagnosis-results">
              {preliminaryPredictions.map((item) => (
                <article key={item.id} className="diagnosis-result">
                  <div className="diagnosis-result-header">
                    <h3>{item.name}</h3>
                    <span>{Math.round(item.score * 100)}%</span>
                  </div>
                  <p>{item.definition}</p>
                </article>
              ))}
            </div>
            <button type="button" className="diagnosis-btn" onClick={() => setStep("detailed")}>
              Перейти к детальной диагностике
            </button>
          </section>
        )}

        {step === "detailed" && (
          <>
          <section className="diagnosis-card">
          <h1>Интеллектуальная система диагностики (адаптивный Random Forest)</h1>
          <p>
            Модель учитывает симптомы, ответы на опросник выше, персональные признаки (пол, возраст, регион). При высокой неопределенности
            система предлагает уточняющие симптомы, чтобы снизить неоднозначность прогноза.
          </p>
          {modelInfo && (
            <div className="diagnosis-model">
              <strong>{modelInfo.name}</strong>
              <span>Деревьев: {modelInfo.estimators}</span>
              <small>{modelInfo.strategy}</small>
            </div>
          )}
          <div className="diagnosis-toolbar">
            <input
              type="search"
              className="diagnosis-search"
              placeholder="Поиск симптома..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="diagnosis-btn" onClick={onSubmit} disabled={submitting}>
              {submitting ? "Рассчитываем..." : "Запустить диагностику"}
            </button>
          </div>
          <div className="diagnosis-selected">Выбрано симптомов: {selected.length}</div>
          <div className="diagnosis-symptoms-list">
            {filteredSymptoms.map((symptom) => (
              <label key={symptom} className="diagnosis-symptom">
                <input type="checkbox" checked={selected.includes(symptom)} onChange={() => toggleSymptom(symptom)} />
                <span>{symptom}</span>
              </label>
            ))}
          </div>
          {error && <div className="diagnosis-error">{error}</div>}
        </section>

        <section className="diagnosis-card">
          <h2>Результаты</h2>
          {uncertainty !== null && (
            <p className="diagnosis-uncertainty">
              Текущая неопределенность: <strong>{Math.round(uncertainty * 100)}%</strong>
            </p>
          )}
          {needClarification && clarifyingSymptoms.length > 0 && (
            <div className="diagnosis-clarify">
              <h3>Уточняющие симптомы (активное обучение)</h3>
              <p>Добавьте 1-2 симптома ниже и повторите диагностику для повышения точности.</p>
              <div className="diagnosis-clarify-list">
                {clarifyingSymptoms.map((item) => (
                  <button
                    key={item.symptom}
                    type="button"
                    className="diagnosis-clarify-item"
                    onClick={() => addClarifyingSymptom(item.symptom)}
                  >
                    + {item.symptom}
                  </button>
                ))}
              </div>
            </div>
          )}
          {predictions.length === 0 ? (
            <p className="diagnosis-empty">Пока нет результатов. Выберите симптомы и запустите диагностику.</p>
          ) : (
            <div className="diagnosis-results">
              {predictions.map((item) => (
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
                    Специалист: {item.specialist.split("|").map((x) => x.trim()).filter(Boolean).join(", ")}
                  </div>
                  <Link to={`/disease/${item.id}`}>Открыть карточку заболевания</Link>
                </article>
              ))}
            </div>
          )}
        </section>
        </>
        )}
      </main>
      <Footer />
    </div>
  );
};