import { BRIDGE_IP, USERNAME } from "./config.local.js";
import * as rainbowFn from "./functions/rainbow.js";

let lightsCache = null;
let lastLightsFetch = 0;
const LIGHTS_CACHE_MS = 10_000;

// name -> module
const loadedFunctions = new Map();
// functionName::lightId -> controller
const runningFunctions = new Map();
// lightId -> original state snapshot
const originalStates = new Map();

// currently selected light (for keyboard shortcut)
let currentSelectedLightId = null;

function setCurrentSelectedLightId(lightId) {
  currentSelectedLightId = lightId || null;
}

function getCurrentSelectedLightId() {
  return currentSelectedLightId;
}

// Register functions statically
function registerFunctions() {
  const list = [rainbowFn]; // add more modules here later

  loadedFunctions.clear();
  for (const mod of list) {
    if (!mod.name || typeof mod.run !== "function") {
      console.warn("Function module missing required exports:", mod);
      continue;
    }
    loadedFunctions.set(mod.name, mod);
  }

  return Array.from(loadedFunctions.entries()).map(([name, mod]) => ({
    name,
    displayName: mod.displayName || name
  }));
}

// Hue API
async function getLights() {
  const now = Date.now();
  if (lightsCache && now - lastLightsFetch < LIGHTS_CACHE_MS) {
    return lightsCache;
  }

  const url = `http://${BRIDGE_IP}/api/${USERNAME}/lights`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`getLights failed: ${res.status}`);
  }
  const data = await res.json();
  if (typeof data !== "object" || data === null) {
    throw new Error("Unexpected lights response");
  }

  lightsCache = data;
  lastLightsFetch = now;
  return data;
}

async function getLightState(lightId) {
  const url = `http://${BRIDGE_IP}/api/${USERNAME}/lights/${lightId}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`getLightState failed: ${res.status}`);
  }
  const data = await res.json();
  if (typeof data !== "object" || data === null) {
    throw new Error("Unexpected light state response");
  }
  return data;
}

async function setLightState(lightId, state) {
  const url = `http://${BRIDGE_IP}/api/${USERNAME}/lights/${lightId}/state`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if (!res.ok) {
    throw new Error(`setLightState failed: ${res.status}`);
  }
  return res.json();
}

// Extract a minimal, restorable state snapshot from Hue light data
function extractStateForRestore(lightData) {
  const state = lightData?.state || {};
  const restore = {};

  if ("on" in state) restore.on = state.on;
  if ("bri" in state) restore.bri = state.bri;

  const colormode = state.colormode;
  if (colormode === "ct" && "ct" in state) {
    restore.ct = state.ct;
  } else if (colormode === "xy" && "xy" in state) {
    restore.xy = state.xy;
  } else if (colormode === "hs") {
    if ("hue" in state) restore.hue = state.hue;
    if ("sat" in state) restore.sat = state.sat;
  } else {
    if ("ct" in state) restore.ct = state.ct;
    if ("xy" in state) restore.xy = state.xy;
    if ("hue" in state) restore.hue = state.hue;
    if ("sat" in state) restore.sat = state.sat;
  }

  // Smooth restore
  restore.transitiontime = 3;
  return restore;
}

function functionKey(functionName, lightId) {
  return `${functionName}::${lightId}`;
}

async function startFunction(functionName, lightId) {
  const mod = loadedFunctions.get(functionName);
  if (!mod) {
    throw new Error(`Function not loaded: ${functionName}`);
  }

  const key = functionKey(functionName, lightId);
  if (runningFunctions.has(key)) {
    await stopFunction(functionName, lightId);
  }

  // Snapshot current state if not already snapshotted
  if (!originalStates.has(lightId)) {
    try {
      const current = await getLightState(lightId);
      const snap = extractStateForRestore(current);
      originalStates.set(lightId, snap);
    } catch (e) {
      console.warn("Could not snapshot light state before function", e);
    }
  }

  // Ensure light is ON when a function runs
  try {
    await setLightState(lightId, { on: true });
  } catch (e) {
    console.warn("Could not set light ON before function", e);
  }

  const controller = await mod.run(lightId, setLightState);
  if (!controller || typeof controller.stop !== "function") {
    throw new Error(
      `Function "${functionName}" did not return a valid controller`
    );
  }
  runningFunctions.set(key, controller);
}

async function stopFunction(functionName, lightId) {
  const key = functionKey(functionName, lightId);
  const controller = runningFunctions.get(key);
  if (controller) {
    try {
      await controller.stop();
    } catch (err) {
      console.error("Error stopping function", functionName, err);
    }
    runningFunctions.delete(key);
  }

  // Restore original state for this light, if we have one
  const snap = originalStates.get(lightId);
  if (snap) {
    try {
      await setLightState(lightId, snap);
    } catch (err) {
      console.error("Error restoring light state after function", err);
    } finally {
      originalStates.delete(lightId);
    }
  }
}

// Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "INIT_POPUP") {
        const [lights] = await Promise.all([getLights()]);
        const functions = registerFunctions();

        // Set the first available light as current selected (if any)
        const entries = Object.keys(lights || {});
        if (entries.length > 0) {
          setCurrentSelectedLightId(entries[0]);
        }

        sendResponse({ lights, functions });
        return;
      }

      if (message.type === "SET_CURRENT_LIGHT") {
        setCurrentSelectedLightId(message.lightId || null);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "GET_CURRENT_LIGHT") {
        sendResponse({ lightId: getCurrentSelectedLightId() });
        return;
      }

      if (message.type === "GET_LIGHT_STATE") {
        const light = await getLightState(message.lightId);
        sendResponse({ light });
        return;
      }

      if (message.type === "SET_LIGHT_STATE") {
        const { lightId, state } = message;
        await setLightState(lightId, state);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "START_FUNCTION") {
        const { functionName, lightId } = message;
        await startFunction(functionName, lightId);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "STOP_FUNCTION") {
        const { functionName, lightId } = message;
        await stopFunction(functionName, lightId);
        sendResponse({ ok: true });
        return;
      }
    } catch (err) {
      console.error("Error handling message", message, err);
      sendResponse({ error: err.message || String(err) });
    }
  })();

  return true;
});

// Keyboard shortcut command: toggle current selected light
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-current-light") return;

  try {
    const lightId = getCurrentSelectedLightId();
    if (!lightId) {
      console.warn("No current selected light to toggle.");
      return;
    }

    const light = await getLightState(lightId);
    const currentOn = !!light?.state?.on;
    const newOn = !currentOn;

    await setLightState(lightId, { on: newOn });

    console.log(
      `Toggled light ${lightId} ${newOn ? "ON" : "OFF"} via shortcut`
    );
  } catch (err) {
    console.error("Error toggling current light via shortcut", err);
  }
});