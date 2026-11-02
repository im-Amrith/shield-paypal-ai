import { ViewTransition } from "react";

// Templates remount on every navigation, so each app page fades and rises in.
// <ViewTransition> uses the View Transitions API where supported; .page-rise is the CSS fallback.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <div className="page-rise">{children}</div>
    </ViewTransition>
  );
}
