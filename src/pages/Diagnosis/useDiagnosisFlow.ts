import { useEffect, useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import {
  diagnose,
  diagnosisOptions,
  diagnosisQuestions,
  meOptional,
  preliminaryDiagnosis,
} from "../../lib/auth-api";
import type { DiagnosisPrediction, DiagnosisQuestion } from "../../lib/auth-api";

export type DiagnosisStep = "questions" | "preliminary" | "detailed";
type ModelInfo = { name: string; estimators: number; strategy: string };
type ClarifyingSymptom = { symptom: string; infoGain: number };

export function useDiagnosisFlow({
  isDemo,
  reloadKey,
  navigate,
  enabled,
}: {
  isDemo: boolean;
  reloadKey: string;
  navigate: NavigateFunction;
  enabled: boolean;
}) {
  const [step, setStep] = useState<DiagnosisStep>("questions");
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
  const [clarifyingSymptoms, setClarifyingSymptoms] = useState<ClarifyingSymptom[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [round, setRound] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const load = async () => {
      try {
        if (!isDemo) {
          const session = await meOptional();
          if (!session) {
            navigate("/auth?next=%2Fdiagnosis");
            return;
          }
        }
        const [questionsData, symptomsData] = await Promise.all([
          diagnosisQuestions(isDemo),
          diagnosisOptions(isDemo),
        ]);
        setQuestions(questionsData.questions);
        setSymptoms(symptomsData.symptoms);
      } catch {
        if (!isDemo) navigate("/auth?next=%2Fdiagnosis");
        else setError("Не удалось запустить деморежим. Попробуйте ещё раз.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [navigate, reloadKey, isDemo, enabled]);

  const filteredSymptoms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? symptoms.filter((item) => item.toLowerCase().includes(normalized)) : symptoms;
  }, [symptoms, query]);

  const currentQuestion = questions[questionIdx];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const canGoNext = useMemo(() => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === "multi") return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    return currentAnswer !== undefined && currentAnswer !== null && String(currentAnswer).trim() !== "";
  }, [currentAnswer, currentQuestion]);

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
  };

  const applyAnswerAndAdvance = async (questionId: string, value: unknown) => {
    setAnswer(questionId, value);
    if (questionIdx < questions.length - 1) {
      setQuestionIdx((previous) => Math.min(previous + 1, questions.length - 1));
      return;
    }

    const nextAnswers = { ...answers, [questionId]: value };
    setSubmitting(true);
    setError("");
    try {
      const response = await preliminaryDiagnosis({ answers: nextAnswers }, isDemo);
      setPreliminaryPredictions(response.predictions || []);
      const allowed = new Set(symptoms);
      const shortlist = (response.relevantSymptoms || []).filter((symptom) => allowed.has(symptom));
      if (shortlist.length > 0) setSelected(shortlist.slice(0, 8));
      setStep("preliminary");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось получить предварительный результат");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSymptom = (symptom: string) => {
    setSelected((previous) => {
      setRound(1);
      return previous.includes(symptom)
        ? previous.filter((selectedSymptom) => selectedSymptom !== symptom)
        : [...previous, symptom];
    });
  };

  const submitDetailed = async () => {
    if (selected.length === 0) {
      setError("Выберите хотя бы один симптом");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await diagnose({ symptoms: selected, round, answers }, isDemo);
      setPredictions(response.predictions);
      setUncertainty(response.uncertainty);
      setNeedClarification(response.needClarification);
      setClarifyingSymptoms(response.clarifyingSymptoms || []);
      setModelInfo(response.modelInfo || null);
      setRound((previous) => previous + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сформировать справочную подборку");
    } finally {
      setSubmitting(false);
    }
  };

  const addClarifyingSymptom = (symptom: string) => {
    setSelected((previous) => {
      setRound(1);
      return previous.includes(symptom) ? previous : [...previous, symptom];
    });
  };

  return {
    step,
    setStep,
    questions,
    answers,
    questionIdx,
    currentQuestion,
    canGoNext,
    preliminaryPredictions,
    query,
    setQuery,
    selected,
    filteredSymptoms,
    predictions,
    uncertainty,
    needClarification,
    clarifyingSymptoms,
    modelInfo,
    submitting,
    loading,
    error,
    setAnswer,
    applyAnswerAndAdvance,
    goNextQuestion: () => {
      if (canGoNext) setQuestionIdx((previous) => Math.min(previous + 1, questions.length - 1));
    },
    goPrevQuestion: () => setQuestionIdx((previous) => Math.max(previous - 1, 0)),
    toggleSymptom,
    submitDetailed,
    addClarifyingSymptom,
  };
}

export type DiagnosisFlow = ReturnType<typeof useDiagnosisFlow>;
