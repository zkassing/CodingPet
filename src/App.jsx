import { useState, useEffect } from "react";
import "./App.css";
import ClawdPet from "./clawd/ClawdPet";
import Settings from "./Settings";

function App() {
  const [isSettingsWindow, setIsSettingsWindow] = useState(false);

  useEffect(() => {
    // Check if this is the settings window
    const path = window.location.pathname;
    if (path === "/settings" || path === "/settings/") {
      setIsSettingsWindow(true);
    }
  }, []);

  if (isSettingsWindow) {
    return <Settings />;
  }

  return <ClawdPet />;
}

export default App;
