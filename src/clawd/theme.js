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
  },
  autoReturn: {
    attention: 4000,
    error: 5000,
    notification: 5000,
    carrying: 3000,
    waking: 1500,
  },
};

export const DEFAULT_CLAWD_STATE = "idle";

export function getClawdSvgForState(state) {
  return CLAWD_THEME.states[state]?.[0] || CLAWD_THEME.states[DEFAULT_CLAWD_STATE][0];
}

export function isKnownClawdState(state) {
  return Object.prototype.hasOwnProperty.call(CLAWD_THEME.states, state);
}
