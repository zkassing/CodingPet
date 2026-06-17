import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CLAWD_THEME, DEFAULT_CLAWD_STATE, getClawdSvgForState, isKnownClawdState } from "./theme";

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const state = typeof payload.state === "string" ? payload.state : DEFAULT_CLAWD_STATE;
  return {
    ...payload,
    state: isKnownClawdState(state) ? state : DEFAULT_CLAWD_STATE,
  };
}

export default function ClawdPet() {
  const [state, setState] = useState(DEFAULT_CLAWD_STATE);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;

    listen("clawd-state-change", (event) => {
      const payload = normalizePayload(event.payload);
      if (!payload) return;
      setState(payload.state);
      setLastEvent({ ...payload, receivedAt: new Date().toLocaleTimeString() });
    }).then((cleanup) => {
      if (cancelled) cleanup();
      else unlisten = cleanup;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const delay = CLAWD_THEME.autoReturn[state];
    if (!delay) return undefined;
    const timer = window.setTimeout(() => setState(DEFAULT_CLAWD_STATE), delay);
    return () => window.clearTimeout(timer);
  }, [state]);

  const svgFile = useMemo(() => getClawdSvgForState(state), [state]);
  const eventLabel = lastEvent?.event || "waiting";
  const sessionLabel = lastEvent?.session_id || "default";

  return (
    <main className="clawd-shell">
      <section className="clawd-stage" aria-label={`Clawd state: ${state}`}>
        <img className="clawd-pet" src={`/clawd/svg/${svgFile}`} alt={`Clawd ${state}`} draggable="false" />
      </section>
      <section className="clawd-status">
        <strong>{state}</strong>
        <span>{eventLabel}</span>
        <small>{sessionLabel}{lastEvent?.receivedAt ? ` · ${lastEvent.receivedAt}` : ""}</small>
      </section>
    </main>
  );
}
