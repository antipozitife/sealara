import React from "react";
import { HttpErrorShell } from "../Error/HttpErrorPage.tsx";

/** Резервный маршрут `/not-found` — то же оформление, код 404. */
export const NotFoundPage = () => <HttpErrorShell code={404} />;
