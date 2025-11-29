import { BRIDGE_IP, USERNAME } from "./config.local.js";

let lightsCache = null;
let lastLightsFetch = 0;
const LIGHTS_CACHE_MS = 10_000;

const loadedFunctions = new Map();
const runningFunctions = new Map();

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

const FUNCTION_MODULES = [
  "rainbow.js",
  "example.js"
];

async function loadFunctionModules() {
  const results = [];

  for (const file of FUNCTION_MODULES) {
    const path = `./functions/${file}`;
    try {
      const mod = await import(path);
      if (!mod.name || typeof mod.run !== "function") {
        console.warn(`Function module ${file} missing required exports`);
        continue;
      }
      const fnName = mod.name;
      loadedFunctions.set(fnName, mod);
      results.push({
        name: fnName,
        displayName: mod.displayName || fnName
      });
    } catch (err) {
      console.error("Error loading function module", file, err);
    }
  }

  return results;
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
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "INIT_POPUP") {
        const [lights, functions] = await Promise.all([
          getLights(),
          loadFunctionModules()
        ]);
        sendResponse({ lights, functions });
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