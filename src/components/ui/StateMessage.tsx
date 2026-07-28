import type { HTMLAttributes, ReactNode } from "react";
import "./state-message.css";

export type StateMessageTone = "info" | "success" | "error";

export type StateMessageProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  tone?: StateMessageTone;
};

export function StateMessage({ children, tone = "info", className = "", role, ...props }: StateMessageProps) {
  return (
    <div
      className={["ui-state-message", `ui-state-message--${tone}`, className].filter(Boolean).join(" ")}
      role={role ?? (tone === "error" ? "alert" : "status")}
      {...props}
    >
      {children}
    </div>
  );
}
