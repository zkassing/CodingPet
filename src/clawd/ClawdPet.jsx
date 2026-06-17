import { useEffect, useMemo, useRef, useState } from "react";
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyIdleTracking(svgRoot, pointer, rect) {
  if (!svgRoot || !pointer || !rect) return;
  const tracking = CLAWD_THEME.eyeTracking;
  const eyes = svgRoot.getElementById(tracking.ids.eyes);
  const body = svgRoot.getElementById(tracking.ids.body);
  const shadow = svgRoot.getElementById(tracking.ids.shadow);
  if (!eyes && !body && !shadow) return;

  const dx = clamp((pointer.x - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1);
  const dy = clamp((pointer.y - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1);
  const eyeX = dx * tracking.maxOffset;
  const eyeY = dy * tracking.maxOffset * 0.55;
  const bodyX = dx * tracking.maxOffset * tracking.bodyScale;
  const bodyY = dy * tracking.maxOffset * tracking.bodyScale * 0.35;
  const shadowX = dx * tracking.shadowShift;
  const shadowScale = 1 + Math.abs(dx) * tracking.shadowStretch;

  if (eyes) eyes.style.transform = `translate(${eyeX}px, ${eyeY}px)`;
  if (body) body.style.transform = `translate(${bodyX}px, ${bodyY}px)`;
  if (shadow) shadow.style.transform = `translate(${shadowX}px, 0) scale(${shadowScale}, 1)`;
}

function resetTracking(svgRoot) {
  if (!svgRoot) return;
  const ids = CLAWD_THEME.eyeTracking.ids;
  [ids.eyes, ids.body, ids.shadow].forEach((id) => {
    const element = svgRoot.getElementById(id);
    if (element) element.style.transform = "";
  });
}

export default function ClawdPet() {
  const objectRef = useRef(null);
  const stageRef = useRef(null);
  const pointerRef = useRef(null);
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

  useEffect(() => {
    const handlePointerMove = (event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    const trackingStates = new Set(CLAWD_THEME.eyeTracking.states);

    const tick = () => {
      const svgRoot = objectRef.current?.contentDocument?.documentElement;
      if (trackingStates.has(state)) {
        applyIdleTracking(svgRoot, pointerRef.current, stageRef.current?.getBoundingClientRect());
      } else {
        resetTracking(svgRoot);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    tick();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [state]);

  const svgFile = useMemo(() => getClawdSvgForState(state), [state]);
  const eventLabel = lastEvent?.event || "waiting";
  const sessionLabel = lastEvent?.session_id || "default";

  return (
    <main className="clawd-shell">
      <section ref={stageRef} className="clawd-stage" aria-label={`Clawd state: ${state}`}>
        <object
          ref={objectRef}
          className="clawd-pet"
          data={`/clawd/svg/${svgFile}`}
          type="image/svg+xml"
          aria-label={`Clawd ${state}`}
        />
      </section>
      <section className="clawd-status">
        <strong>{state}</strong>
        <span>{eventLabel}</span>
        <small>{sessionLabel}{lastEvent?.receivedAt ? ` · ${lastEvent.receivedAt}` : ""}</small>
      </section>
    </main>
  );
}
