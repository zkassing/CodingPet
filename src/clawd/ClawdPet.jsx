import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { cursorPosition, getCurrentWindow } from "@tauri-apps/api/window";
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

function setTrackedEyeOffset(eyes, offsetX, offsetY) {
  eyes.querySelectorAll("rect").forEach((eye) => {
    if (!eye.dataset.baseX) eye.dataset.baseX = eye.getAttribute("x") || "0";
    if (!eye.dataset.baseY) eye.dataset.baseY = eye.getAttribute("y") || "0";

    const baseX = Number.parseFloat(eye.dataset.baseX);
    const baseY = Number.parseFloat(eye.dataset.baseY);
    eye.setAttribute("x", (baseX + offsetX).toFixed(2));
    eye.setAttribute("y", (baseY + offsetY).toFixed(2));
  });
}

function resetTrackedEyes(eyes) {
  eyes.querySelectorAll("rect").forEach((eye) => {
    if (eye.dataset.baseX) eye.setAttribute("x", eye.dataset.baseX);
    if (eye.dataset.baseY) eye.setAttribute("y", eye.dataset.baseY);
  });
}

function getIdleTrackingTarget(pointer, rect) {
  if (!pointer || !rect) return NEUTRAL_TRACKING;

  const tracking = CLAWD_THEME.eyeTracking;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clamp((pointer.x - centerX) / Math.max(rect.width / 2, 1), -1, 1);
  const dy = clamp((pointer.y - centerY) / Math.max(rect.height / 2, 1), -1, 1);

  return {
    eyeX: dx * tracking.maxOffset,
    eyeY: dy * tracking.maxOffset * tracking.verticalScale,
    shadowX: dx * tracking.shadowShift,
    shadowScale: 1 + Math.abs(dx) * tracking.shadowStretch,
  };
}

function easeTracking(current, target) {
  return {
    eyeX: current.eyeX + (target.eyeX - current.eyeX) * EYE_TRACKING_EASE,
    eyeY: current.eyeY + (target.eyeY - current.eyeY) * EYE_TRACKING_EASE,
    shadowX: current.shadowX + (target.shadowX - current.shadowX) * EYE_TRACKING_EASE,
    shadowScale: current.shadowScale + (target.shadowScale - current.shadowScale) * EYE_TRACKING_EASE,
  };
}

function applyIdleTracking(svgRoot, offsets) {
  if (!svgRoot) return;
  const tracking = CLAWD_THEME.eyeTracking;
  const eyes = svgRoot.getElementById(tracking.ids.eyes);
  const shadow = svgRoot.getElementById(tracking.ids.shadow);
  if (!eyes && !shadow) return;

  if (eyes) setTrackedEyeOffset(eyes, offsets.eyeX, offsets.eyeY);
  if (shadow) {
    shadow.setAttribute(
      "transform",
      `translate(${offsets.shadowX.toFixed(2)} 0) scale(${offsets.shadowScale.toFixed(2)} 1)`,
    );
  }
}

function resetTracking(svgRoot) {
  if (!svgRoot) return;
  const ids = CLAWD_THEME.eyeTracking.ids;
  [ids.eyes, ids.body, ids.shadow].forEach((id) => {
    const element = svgRoot.getElementById(id);
    if (element) {
      element.style.transform = "";
      element.removeAttribute("transform");
      if (id === ids.eyes) resetTrackedEyes(element);
    }
  });
}

const DRAG_THRESHOLD = 5;
const CLICK_WINDOW_MS = 400;
const DOUBLE_FRAME_MS = 450;
const ANNOYED_CLICK_COUNT = 4;
const CLAWD_VIEWBOX = "-8 -12 31 31";
const EYE_TRACKING_EASE = 0.18;
const NEUTRAL_TRACKING = {
  eyeX: 0,
  eyeY: 0,
  shadowX: 0,
  shadowScale: 1,
};
const SHOW_STATUS = import.meta.env.DEV;
const UPDATE_STATUS = {
  IDLE: "idle",
  AVAILABLE: "available",
  DOWNLOADING: "downloading",
  ERROR: "error",
};

function cropClawdSvg(markup) {
  return markup.replace(/<svg\b([^>]*)\bviewBox="[^"]*"/, `<svg$1viewBox="${CLAWD_VIEWBOX}"`);
}

function getSvgForStateFrame(state, frame) {
  const files = CLAWD_THEME.states[state] || CLAWD_THEME.states[DEFAULT_CLAWD_STATE];
  return files[Math.min(frame, files.length - 1)] || files[0];
}

export default function ClawdPet() {
  const svgHostRef = useRef(null);
  const stageRef = useRef(null);
  const pointerRef = useRef(null);
  const trackingOffsetRef = useRef(NEUTRAL_TRACKING);
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
  const [petScale, setPetScale] = useState(1.0);

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

  // Load preferences on mount
  useEffect(() => {
    let cancelled = false;
    let unlisten = null;

    const applyPrefs = (prefs) => {
      if (!cancelled && prefs) {
        setPetScale(prefs.size || 1.0);
      }
    };

    invoke("load_preferences")
      .then(applyPrefs)
      .catch((error) => {
        console.warn("failed to load preferences", error);
      });

    listen("preferences-changed", (event) => {
      applyPrefs(event.payload);
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
    let animationFrame = 0;
    const trackingStates = new Set(CLAWD_THEME.eyeTracking.states);

    const tick = () => {
      const svgRoot = svgHostRef.current?.querySelector("svg");
      if (trackingStates.has(state)) {
        const rect = svgHostRef.current?.getBoundingClientRect();
        const target = getIdleTrackingTarget(pointerRef.current, rect);
        const nextOffsets = easeTracking(trackingOffsetRef.current, target);
        trackingOffsetRef.current = nextOffsets;
        applyIdleTracking(svgRoot, nextOffsets);
      } else {
        trackingOffsetRef.current = NEUTRAL_TRACKING;
        resetTracking(svgRoot);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };

    tick();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    let intervalTimer = 0;
    const appWindow = getCurrentWindow();

    const updateGlobalCursor = async () => {
      try {
        const [cursor, windowPosition, scaleFactor] = await Promise.all([
          cursorPosition(),
          appWindow.outerPosition(),
          appWindow.scaleFactor(),
        ]);
        if (cancelled) return;
        pointerRef.current = {
          x: (cursor.x - windowPosition.x) / scaleFactor,
          y: (cursor.y - windowPosition.y) / scaleFactor,
        };
      } catch (error) {
        if (!cancelled) console.warn("failed to update Clawd cursor tracking", error);
      }
    };

    updateGlobalCursor();
    intervalTimer = window.setInterval(updateGlobalCursor, 32);
    return () => {
      cancelled = true;
      window.clearInterval(intervalTimer);
    };
  }, []);

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

  async function openSettings() {
    try {
      await invoke("open_settings_window");
    } catch (error) {
      console.warn("failed to open settings", error);
    }
  }

  async function handleClick(button, event) {
    if (button === 2) {
      resetClickAccumulator();
      playReaction("clickRight");
      // Show native context menu (can overflow outside the window)
      try {
        await invoke("show_right_click_menu");
      } catch (error) {
        console.warn("failed to show context menu", error);
      }
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

    handleClick(drag.button, event);
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
        if (!cancelled) setSvgMarkup(cropClawdSvg(markup));
      })
      .catch((error) => {
        console.warn("failed to load Clawd SVG", error);
        if (!cancelled) setSvgMarkup("");
      });
    return () => {
      cancelled = true;
    };
  }, [svgFile]);

  const shellStyle = {
    transform: `scale(${petScale})`,
    transformOrigin: "center center",
  };

  return (
    <main className="clawd-shell" style={shellStyle}>
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
