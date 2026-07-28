import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DiagnosisPage } from "./DiagnosisPage";
import {
  diagnose,
  diagnosisOptions,
  diagnosisQuestions,
  meOptional,
  preliminaryDiagnosis,
} from "../../lib/auth-api";

jest.mock("../../components/header/Header", () => ({
  Header: () => <header>Sealara</header>,
}));
jest.mock("../../components/footer/Footer", () => ({
  Footer: () => <footer>Подвал</footer>,
}));
jest.mock("../../lib/auth-api", () => ({
  diagnosisOptions: jest.fn(),
  diagnosisQuestions: jest.fn(),
  preliminaryDiagnosis: jest.fn(),
  diagnose: jest.fn(),
  meOptional: jest.fn(),
}));

const mockedQuestions = jest.mocked(diagnosisQuestions);
const mockedOptions = jest.mocked(diagnosisOptions);
const mockedSession = jest.mocked(meOptional);
const mockedPreliminary = jest.mocked(preliminaryDiagnosis);
const mockedDiagnose = jest.mocked(diagnose);

const renderDiagnosis = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/diagnosis" element={<DiagnosisPage />} />
        <Route path="/auth" element={<div>Страница авторизации</div>} />
      </Routes>
    </MemoryRouter>,
  );

const acceptNotice = async () => {
  const user = userEvent.setup();
  for (const checkbox of screen.getAllByRole("checkbox")) {
    await user.click(checkbox);
  }
  await user.click(screen.getByRole("button", { name: "Продолжить к справочному анализу" }));
};

describe("DiagnosisPage access contours", () => {
  beforeEach(() => {
    mockedQuestions.mockResolvedValue({
      questions: [
        {
          id: "severity",
          question: "Насколько выражены симптомы?",
          type: "single",
          options: [{ value: "mild", label: "Слабо" }],
        },
      ],
    });
    mockedOptions.mockResolvedValue({ symptoms: ["кашель"] });
  });

  it("does not request symptom data before explicit confirmations", () => {
    renderDiagnosis("/diagnosis?mode=demo");

    expect(screen.getByRole("button", { name: "Продолжить к справочному анализу" })).toBeDisabled();
    expect(mockedQuestions).not.toHaveBeenCalled();
    expect(mockedOptions).not.toHaveBeenCalled();
  });

  it("starts demo without checking an account and requests demo data", async () => {
    renderDiagnosis("/diagnosis?mode=demo");
    await acceptNotice();

    expect(await screen.findByText("Деморежим")).toBeInTheDocument();
    expect(screen.getByText("Насколько выражены симптомы?")).toBeInTheDocument();
    expect(mockedSession).not.toHaveBeenCalled();
    expect(mockedQuestions).toHaveBeenCalledWith(true);
    expect(mockedOptions).toHaveBeenCalledWith(true);
    expect(screen.getByRole("link", { name: "Войти для режима с историей" })).toHaveAttribute(
      "href",
      "/auth?next=%2Fdiagnosis",
    );
  });

  it("redirects a guest from the full contour to auth with a return path", async () => {
    mockedSession.mockResolvedValue(null);

    renderDiagnosis("/diagnosis");
    await acceptNotice();

    expect(await screen.findByText("Страница авторизации")).toBeInTheDocument();
    await waitFor(() => expect(mockedSession).toHaveBeenCalledTimes(1));
    expect(mockedQuestions).not.toHaveBeenCalled();
    expect(mockedOptions).not.toHaveBeenCalled();
  });

  it("loads personalized questions for an authenticated user", async () => {
    mockedSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@sealara.test",
        name: "Тест",
        createdAt: "2026-01-01T00:00:00.000Z",
        profile: {
          surname: "",
          firstName: "Тест",
          middleName: "",
          birthDate: "",
          gender: "",
          phone: "",
          region: "",
        },
        recentQueries: [],
      },
    });

    renderDiagnosis("/diagnosis");
    await acceptNotice();

    expect(await screen.findByText("Насколько выражены симптомы?")).toBeInTheDocument();
    expect(mockedQuestions).toHaveBeenCalledWith(false);
    expect(mockedOptions).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Деморежим")).not.toBeInTheDocument();
  });

  it("completes the demo flow and renders the detailed result", async () => {
    const user = userEvent.setup();
    const prediction = {
      id: 31,
      name: "Аллергический ринит",
      score: 0.78,
      probability: 0.74,
      personalization: 0,
      definition: "Справочное совпадение.",
      specialist: "Аллерголог",
    };
    mockedPreliminary.mockResolvedValue({
      predictions: [prediction],
      relevantSymptoms: ["кашель"],
      uncertainty: 0.35,
      needMoreDetails: true,
    });
    mockedDiagnose.mockResolvedValue({
      predictions: [prediction],
      uncertainty: 0.22,
      needClarification: false,
      clarifyingSymptoms: [],
      modelInfo: { name: "Demo model", estimators: 100, strategy: "test" },
      profileUsed: { age: null, gender: "", region: "" },
    });

    renderDiagnosis("/diagnosis?mode=demo");
    await acceptNotice();
    await user.click(await screen.findByRole("radio", { name: "Слабо" }));

    expect(
      await screen.findByRole("heading", { name: "Предварительные справочные совпадения" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Уточнить наблюдения" }));
    await user.click(screen.getByRole("button", { name: "Сформировать справочную подборку" }));

    expect(await screen.findByRole("heading", { name: "Аллергический ринит" })).toBeInTheDocument();
    expect(screen.getByText("Текущая неопределенность:")).toHaveTextContent("22%");
    expect(mockedDiagnose).toHaveBeenCalledWith(
      expect.objectContaining({ symptoms: ["кашель"], round: 1 }),
      true,
    );
  });
});
