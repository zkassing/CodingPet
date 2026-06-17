import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CLAWD_THEME, DEFAULT_CLAWD_STATE, isKnownClawdState } from "./theme";

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

const DRAG_THRESHOLD = 5;
const CLICK_WINDOW_MS = 400;
const DOUBLE_FRAME_MS = 450;
const ANNOYED_CLICK_COUNT = 4;

function getSvgForStateFrame(state, frame) {
  const files = CLAWD_THEME.states[state] || CLAWD_THEME.states[DEFAULT_CLAWD_STATE];
  return files[Math.min(frame, files.length - 1)] || files[0];
}

export default function ClawdPet() {
  const objectRef = useRef(null);
  const stageRef = useRef(null);
  const pointerRef = useRef(null);
  const dragStartRef = useRef(null);
  const isDraggingRef = useRef(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);
  const doubleFrameTimerRef = useRef(null);
  const [state, setState] = useState(DEFAULT_CLAWD_STATE);
  const [reactionFrame, setReactionFrame] = useState(0);
  const [dragging, setDragging] = useState(false);
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
    if (state !== "double") {
      setReactionFrame(0);
      return undefined;
    }
    const timer = window.setTimeout(() => setReactionFrame(1), DOUBLE_FRAME_MS);
    doubleFrameTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      doubleFrameTimerRef.current = null;
    };
  }, [state]);

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

  function playReaction(nextState) {
    if (doubleFrameTimerRef.current) {
      window.clearTimeout(doubleFrameTimerRef.current);
      doubleFrameTimerRef.current = null;
    }
    setReactionFrame(0);
    setState(nextState);
  }

  function resetClickAccumulator() {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    clickCountRef.current = 0;
  }

  function handleClick(button) {
    if (button === 2) {
      resetClickAccumulator();
      playReaction("clickRight");
      return;
    }

    clickCountRef.current += 1;
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);

    clickTimerRef.current = window.setTimeout(() => {
      const count = clickCountRef.current;
      resetClickAccumulator();
      if (count >= ANNOYED_CLICK_COUNT) playReaction("annoyed");
      else if (count >= 2) playReaction("double");
      else playReaction("clickLeft");
    }, CLICK_WINDOW_MS);
  }

  async function moveWindowBy(dx, dy) {
    const appWindow = getCurrentWindow();
    const position = await appWindow.outerPosition();
    await appWindow.setPosition(new PhysicalPosition(position.x + dx, position.y + dy));
  }

  async function saveCurrentWindowPosition() {
    const position = await getCurrentWindow().outerPosition();
    await invoke("save_window_position", { x: position.x, y: position.y });
  }

  function handlePointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartRef.current = {
      button: event.button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    };
  }

  async function handlePointerMove(event) {
    const drag = dragStartRef.current;
    if (!drag || drag.button !== 0) return;
    const totalDx = event.clientX - drag.startX;
    const totalDy = event.clientY - drag.startY;
    if (!isDraggingRef.current && Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD) return;

    const stepDx = event.clientX - drag.lastX;
    const stepDy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    if (!isDraggingRef.current) {
      resetClickAccumulator();
      isDraggingRef.current = true;
      setDragging(true);
      playReaction("drag");
    }

    try {
      await moveWindowBy(stepDx, stepDy);
    } catch (error) {
      console.warn("failed to move Clawd window", error);
    }
  }

  function handlePointerUp(event) {
    const drag = dragStartRef.current;
    if (!drag) return;
    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    dragStartRef.current = null;

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setDragging(false);
      setState(DEFAULT_CLAWD_STATE);
      saveCurrentWindowPosition().catch((error) => {
        console.warn("failed to save Clawd window position", error);
      });
      return;
    }

    handleClick(drag.button);
  }

  function handlePointerCancel() {
    dragStartRef.current = null;
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setDragging(false);
      setState(DEFAULT_CLAWD_STATE);
    }
  }

  const svgFile = useMemo(() => getSvgForStateFrame(state, reactionFrame), [state, reactionFrame]);
  const eventLabel = lastEvent?.event || "waiting";
  const sessionLabel = lastEvent?.session_id || "default";

  return (
    <main className="clawd-shell">
      <section
        ref={stageRef}
        className={`clawd-stage${dragging ? " dragging" : ""}`}
        aria-label={`Clawd state: ${state}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
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
