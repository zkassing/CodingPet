import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
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
const SHOW_STATUS = import.meta.env.DEV;
const UPDATE_STATUS = {
  IDLE: "idle",
  AVAILABLE: "available",
  DOWNLOADING: "downloading",
  ERROR: "error",
};

function getSvgForStateFrame(state, frame) {
  const files = CLAWD_THEME.states[state] || CLAWD_THEME.states[DEFAULT_CLAWD_STATE];
  return files[Math.min(frame, files.length - 1)] || files[0];
}

export default function ClawdPet() {
  const svgHostRef = useRef(null);
  const stageRef = useRef(null);
  const pointerRef = useRef(null);
  const dragStartRef = useRef(null);
  const isDraggingRef = useRef(false);
  const updateCheckStartedRef = useRef(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);
  const doubleFrameTimerRef = useRef(null);
  const [state, setState] = useState(DEFAULT_CLAWD_STATE);
  const [reactionFrame, setReactionFrame] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [updateState, setUpdateState] = useState({ status: UPDATE_STATUS.IDLE, update: null, error: null });

  useEffect(() => {
    if (updateCheckStartedRef.current) return undefined;
    updateCheckStartedRef.current = true;
    let cancelled = false;

    check()
      .then((update) => {
        if (cancelled || !update) return;
        setUpdateState({ status: UPDATE_STATUS.AVAILABLE, update, error: null });
      })
      .catch((error) => {
        console.warn("failed to check CodingPet update", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      const svgRoot = svgHostRef.current?.querySelector("svg");
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

  async function startWindowDrag() {
    await getCurrentWindow().startDragging();
  }

  async function saveCurrentWindowPosition() {
    const position = await getCurrentWindow().outerPosition();
    await invoke("save_window_position", { x: position.x, y: position.y });
  }

  async function installUpdate() {
    if (!updateState.update || updateState.status === UPDATE_STATUS.DOWNLOADING) return;
    setUpdateState((current) => ({ ...current, status: UPDATE_STATUS.DOWNLOADING, error: null }));
    try {
      await updateState.update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      console.warn("failed to install CodingPet update", error);
      setUpdateState((current) => ({
        ...current,
        status: UPDATE_STATUS.ERROR,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  function dismissUpdate() {
    setUpdateState({ status: UPDATE_STATUS.IDLE, update: null, error: null });
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

    if (!isDraggingRef.current) {
      resetClickAccumulator();
      isDraggingRef.current = true;
      setDragging(true);
      playReaction("drag");
      try {
        await startWindowDrag();
      } catch (error) {
        console.warn("failed to start Clawd window drag", error);
      }
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
  const [svgMarkup, setSvgMarkup] = useState("");
  const eventLabel = lastEvent?.event || "waiting";
  const sessionLabel = lastEvent?.session_id || "default";
  const updateVersion = updateState.update?.version;
  const isInstallingUpdate = updateState.status === UPDATE_STATUS.DOWNLOADING;
  const showUpdatePrompt = updateState.status !== UPDATE_STATUS.IDLE;

  useEffect(() => {
    let cancelled = false;
    fetch(`/clawd/svg/${svgFile}`)
      .then((response) => response.text())
      .then((markup) => {
        if (!cancelled) setSvgMarkup(markup);
      })
      .catch((error) => {
        console.warn("failed to load Clawd SVG", error);
        if (!cancelled) setSvgMarkup("");
      });
    return () => {
      cancelled = true;
    };
  }, [svgFile]);

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
        <div
          ref={svgHostRef}
          className="clawd-pet"
          aria-label={`Clawd ${state}`}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </section>
      {showUpdatePrompt ? (
        <section className="clawd-update" aria-live="polite">
          <strong>{updateState.status === UPDATE_STATUS.ERROR ? "更新失败" : "发现新版本"}</strong>
          <span>
            {updateState.status === UPDATE_STATUS.ERROR
              ? updateState.error || "请稍后重试"
              : updateVersion
                ? `v${updateVersion}`
                : "可以更新啦"}
          </span>
          <div className="clawd-update-actions">
            <button type="button" onClick={installUpdate} disabled={isInstallingUpdate}>
              {isInstallingUpdate ? "安装中…" : "更新"}
            </button>
            <button type="button" onClick={dismissUpdate} disabled={isInstallingUpdate} aria-label="稍后再说">
              稍后
            </button>
          </div>
        </section>
      ) : null}
      {SHOW_STATUS ? (
        <section className="clawd-status">
          <strong>{state}</strong>
          <span>{eventLabel}</span>
          <small>{sessionLabel}{lastEvent?.receivedAt ? ` · ${lastEvent.receivedAt}` : ""}</small>
        </section>
      ) : null}
    </main>
  );
}
