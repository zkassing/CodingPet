export const CLAWD_THEME = {
  states: {
    idle: ["clawd-idle-follow.svg"],
    thinking: ["clawd-working-thinking.svg"],
    working: ["clawd-working-typing.svg"],
    juggling: ["clawd-headphones-groove.svg"],
    sweeping: ["clawd-working-sweeping.svg"],
    error: ["clawd-error.svg"],
    attention: ["clawd-happy.svg"],
    notification: ["clawd-notification.svg"],
    carrying: ["clawd-working-carrying.svg"],
    sleeping: ["clawd-sleeping.svg"],
    waking: ["clawd-wake.svg"],
    drag: ["clawd-react-drag.svg"],
    clickLeft: ["clawd-react-left.svg"],
    clickRight: ["clawd-react-right.svg"],
    annoyed: ["clawd-react-annoyed.svg"],
    double: ["clawd-react-double.svg", "clawd-react-double-jump.svg"],
  },
  autoReturn: {
    attention: 4000,
    error: 5000,
    notification: 5000,
    carrying: 3000,
    waking: 1500,
    clickLeft: 2500,
    clickRight: 2500,
    annoyed: 3500,
    double: 3500,
  },
  eyeTracking: {
    states: ["idle"],
    ids: {
      eyes: "eyes-js",
      body: "body-js",
      shadow: "shadow-js",
    },
    maxOffset: 1.6,
    verticalScale: 0.45,
    shadowStretch: 0.08,
    shadowShift: 0.3,
  },
};

export const DEFAULT_CLAWD_STATE = "idle";

export function getClawdSvgForState(state) {
  return CLAWD_THEME.states[state]?.[0] || CLAWD_THEME.states[DEFAULT_CLAWD_STATE][0];
}

export function isKnownClawdState(state) {
  return Object.prototype.hasOwnProperty.call(CLAWD_THEME.states, state);
}
