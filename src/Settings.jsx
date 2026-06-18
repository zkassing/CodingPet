import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./Settings.css";

const DEFAULT_PREFS = {
  version: 1,
  size: 1.0,
  lang: "zh",
  show_tray: true,
  auto_start: false,
  auto_update_check: true,
  always_on_top: true,
  click_through: false,
};

function IconSettings(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconAgent(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4" y="7" width="16" height="12" rx="2" />
      <path d="M12 7V3" />
      <circle cx="12" cy="3" r="1" />
      <path d="M8 13h.01" />
      <path d="M16 13h.01" />
      <path d="M9 17h6" />
    </svg>
  );
}

function IconInfo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

const TABS = [
  { id: "general", Icon: IconSettings, label: "通用" },
  { id: "agents", Icon: IconAgent, label: "Agent" },
  { id: "about", Icon: IconInfo, label: "关于" },
];

const LANGUAGE_OPTIONS = [
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function Switch({ checked, pending, onToggle, label }) {
  return (
    <button
      type="button"
      className={`switch${checked ? " on" : ""}${pending ? " pending" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={pending}
      onClick={onToggle}
    />
  );
}

function Section({ title, children }) {
  return (
    <section className="section">
      <h2 className="section-title">{title}</h2>
      <div className="section-rows">{children}</div>
    </section>
  );
}

function Row({ label, desc, children }) {
  return (
    <div className="row">
      <div className="row-text">
        <span className="row-label">{label}</span>
        {desc ? <span className="row-desc">{desc}</span> : null}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export default function Settings() {
  const [prefs, setPrefs] = useState(null);
  const [activeTab, setActiveTab] = useState("general");
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const [toast, setToast] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentBusy, setAgentBusy] = useState(() => new Set());
  const toastTimerRef = useRef(0);
  const sizeCommitTimerRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    invoke("load_preferences")
      .then((loaded) => {
        if (!cancelled) setPrefs({ ...DEFAULT_PREFS, ...(loaded || {}) });
      })
      .catch((error) => {
        console.warn("failed to load preferences", error);
        if (!cancelled) setPrefs(DEFAULT_PREFS);
      });
    invoke("list_agent_hooks")
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setAgents(list);
      })
      .catch((error) => {
        console.warn("failed to load agent hooks", error);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(toastTimerRef.current);
      window.clearTimeout(sizeCommitTimerRef.current);
    };
  }, []);

  const activeTabLabel = useMemo(
    () => TABS.find((tab) => tab.id === activeTab)?.label || "设置",
    [activeTab],
  );

  function showToast(message, kind = "ok") {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  function setPending(key, pending) {
    setPendingKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function persist(nextPrefs, key) {
    setPending(key, true);
    try {
      await invoke("save_preferences", { prefs: nextPrefs });
      if (key === "always_on_top") {
        await invoke("set_always_on_top", { enabled: nextPrefs.always_on_top });
      }
      if (key === "show_tray") {
        await invoke("set_tray_visible", { visible: nextPrefs.show_tray });
      }
      if (key === "auto_start") {
        await invoke("set_auto_start", { enabled: nextPrefs.auto_start });
      }
      if (key === "click_through") {
        await invoke("set_click_through", { enabled: nextPrefs.click_through });
      }
      showToast("已保存");
    } catch (error) {
      console.warn("failed to save preferences", error);
      showToast("保存失败", "error");
      setPrefs((current) => ({ ...current, [key]: prefs?.[key] ?? DEFAULT_PREFS[key] }));
    } finally {
      setPending(key, false);
    }
  }

  function updatePref(key, value, { debounce = false } = {}) {
    if (!prefs) return;
    const nextPrefs = { ...prefs, [key]: value };
    setPrefs(nextPrefs);

    window.clearTimeout(sizeCommitTimerRef.current);
    if (debounce) {
      sizeCommitTimerRef.current = window.setTimeout(() => persist(nextPrefs, key), 260);
      return;
    }
    persist(nextPrefs, key);
  }

  function setAgentBusyKey(id, busy) {
    setAgentBusy((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggleAgentHook(agent) {
    if (!agent) return;
    const command = agent.installed ? "uninstall_agent_hook" : "install_agent_hook";
    setAgentBusyKey(agent.id, true);
    try {
      const updated = await invoke(command, { agentId: agent.id });
      setAgents((current) => current.map((item) => (item.id === agent.id ? updated : item)));
      showToast(updated.installed ? `${agent.name} 已安装` : `${agent.name} 已卸载`);
    } catch (error) {
      console.warn("agent hook toggle failed", error);
      const message = typeof error === "string" ? error : (error && error.message) || "操作失败";
      showToast(message, "error");
    } finally {
      setAgentBusyKey(agent.id, false);
    }
  }

  if (!prefs) {
    return (
      <div className="settings-loading">
        <div className="spinner" />
        <p>加载设置中…</p>
      </div>
    );
  }

  const size = clamp(Number(prefs.size) || 1, 0.5, 2);
  const sizePercent = Math.round(size * 100);
  const sizeFillPercent = ((size - 0.5) / 1.5) * 100;

  return (
    <>
      <div className="app">
        <nav className="sidebar" aria-label="设置分区">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`sidebar-item${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="sidebar-item-icon">
                <tab.Icon width={16} height={16} />
              </span>
              <span className="sidebar-item-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <main className="content">
          <h1>{activeTabLabel}</h1>
          <p className="subtitle">自定义 Clawd 的核心行为</p>

          {activeTab === "general" ? (
            <>
              <Section title="外观">
                <Row label="界面语言" desc="设置设置窗口和偏好显示语言">
                  <select
                    value={prefs.lang}
                    className="select-control"
                    onChange={(event) => updatePref("lang", event.target.value)}
                    disabled={pendingKeys.has("lang")}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label="宠物大小" desc="调整 Clawd 在屏幕上的显示比例">
                  <div className="size-control">
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.05"
                      value={size}
                      className="volume-slider"
                      style={{ "--volume-fill": `${sizeFillPercent}%` }}
                      onChange={(event) => updatePref("size", Number.parseFloat(event.target.value), { debounce: true })}
                    />
                    <span className="volume-readout">{sizePercent}%</span>
                  </div>
                </Row>

                <Row label="置顶显示" desc="让 Clawd 始终显示在其他窗口上方">
                  <Switch
                    label="置顶显示"
                    checked={!!prefs.always_on_top}
                    pending={pendingKeys.has("always_on_top")}
                    onToggle={() => updatePref("always_on_top", !prefs.always_on_top)}
                  />
                </Row>

                <Row label="穿透点击" desc="点击事件穿透 Clawd 窗口到下方窗口（拖拽仍可用）">
                  <Switch
                    label="穿透点击"
                    checked={!!prefs.click_through}
                    pending={pendingKeys.has("click_through")}
                    onToggle={() => updatePref("click_through", !prefs.click_through)}
                  />
                </Row>
              </Section>

              <Section title="系统">
                <Row label="显示托盘图标" desc="在系统托盘或菜单栏中显示 Clawd 图标">
                  <Switch
                    label="显示托盘图标"
                    checked={!!prefs.show_tray}
                    pending={pendingKeys.has("show_tray")}
                    onToggle={() => updatePref("show_tray", !prefs.show_tray)}
                  />
                </Row>

                <Row label="开机启动" desc="登录系统后自动启动 CodingPet">
                  <Switch
                    label="开机启动"
                    checked={!!prefs.auto_start}
                    pending={pendingKeys.has("auto_start")}
                    onToggle={() => updatePref("auto_start", !prefs.auto_start)}
                  />
                </Row>

                <Row label="自动检查更新" desc="定期检查新版本并提示更新">
                  <Switch
                    label="自动检查更新"
                    checked={!!prefs.auto_update_check}
                    pending={pendingKeys.has("auto_update_check")}
                    onToggle={() => updatePref("auto_update_check", !prefs.auto_update_check)}
                  />
                </Row>
              </Section>
            </>
          ) : activeTab === "agents" ? (
            <Section title="Agent Hook">
              {agents.length === 0 ? (
                <div className="row">
                  <div className="row-text">
                    <span className="row-label">加载中…</span>
                    <span className="row-desc">正在读取 Agent 状态</span>
                  </div>
                </div>
              ) : (
                agents.map((agent) => {
                  const busy = agentBusy.has(agent.id);
                  const desc = agent.id === "claude-code"
                    ? "在 ~/.claude/settings.json 中注册生命周期 hook"
                    : agent.id === "codex"
                    ? "在 ~/.codex/hooks.json 中注册生命周期 hook（首次使用需在 Codex CLI 中运行 /hooks 信任）"
                    : "为该 Agent 注册 Clawd 状态 hook";
                  return (
                    <Row
                      key={agent.id}
                      label={agent.name}
                      desc={desc}
                    >
                      <span className={`agent-status${agent.installed ? " on" : ""}`}>
                        {agent.installed ? "已安装" : "未安装"}
                      </span>
                      <button
                        type="button"
                        className={`agent-action${agent.installed ? " danger" : ""}`}
                        disabled={busy}
                        onClick={() => toggleAgentHook(agent)}
                      >
                        {busy ? "处理中…" : (agent.installed ? "卸载" : "安装")}
                      </button>
                    </Row>
                  );
                })
              )}
            </Section>
          ) : (
            <div className="about-hero">
              <div className="about-crab-wrap" aria-hidden="true">Clawd</div>
              <h2 className="about-title">CodingPet</h2>
              <p className="about-tagline">你的编程小伙伴 Clawd，陪你保持一点轻盈。</p>

              <section className="section about-info-section">
                <div className="section-rows">
                  <div className="about-info-row">
                    <div className="about-info-label">版本</div>
                    <div className="about-info-value">0.1.2</div>
                  </div>
                  <div className="about-info-row">
                    <div className="about-info-label">项目</div>
                    <div className="about-info-value">
                      <a href="https://github.com/zkassing/CodingPet" target="_blank" rel="noreferrer">
                        GitHub
                      </a>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      <div className="toast-stack" aria-live="polite">
        {toast ? <div className={`toast visible${toast.kind === "error" ? " error" : ""}`}>{toast.message}</div> : null}
      </div>
    </>
  );
}
