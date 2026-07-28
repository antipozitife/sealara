import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { meOptional } from "../../lib/auth-api";
import { Header } from "./Header";

jest.mock("../../lib/auth-api", () => ({
  meOptional: jest.fn(),
}));

const mockedSession = jest.mocked(meOptional);

describe("Header guest navigation", () => {
  beforeEach(() => {
    mockedSession.mockResolvedValue(null);
  });

  it("routes diagnosis to demo and marks private destinations as locked", async () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "анализ симптомов" })).toHaveAttribute(
      "href",
      "/diagnosis?mode=demo",
    );
    expect(screen.getByRole("link", { name: /профиль/ })).toHaveAttribute("href", "/auth?next=%2Fprofile");
    expect(screen.getByRole("link", { name: /врачи/ })).toHaveAttribute("href", "/auth?next=%2Fdoctors");
  });

  it("exposes an accessible collapsible navigation control", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: "Открыть меню" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Закрыть меню" })).toHaveAttribute("aria-expanded", "true");
  });
});
