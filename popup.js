function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function getSelectedLightId() {
  const select = document.getElementById("light-select");
  return select?.value || null;
}

function getSelectedFunctionName() {
  const select = document.getElementById("function-select");
  return select?.value || null;
}

function populateLightsSelect(lights) {
  const select = document.getElementById("light-select");
  select.innerHTML = "";

  const entries = Object.entries(lights || {}).sort(([, a], [, b]) => {
    const na = a.name || "";
    const nb = b.name || "";
    return na.localeCompare(nb);
  });

  if (entries.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No lights found";
    select.appendChild(opt);
    return;
  }

  for (const [id, info] of entries) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = info.name || `Light ${id}`;
    select.appendChild(opt);
  }
}

function populateFunctionsSelect(functions) {
  const select = document.getElementById("function-select");
  select.innerHTML = "";

  if (!functions || functions.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No functions";
    select.appendChild(opt);
    return;
  }

  for (const fn of functions) {
    const opt = document.createElement("option");
    opt.value = fn.name;
    opt.textContent = fn.displayName || fn.name;
    select.appendChild(opt);
  }
}

function updateLightUI(lightState) {
  if (!lightState || !lightState.state) return;
  const st = lightState.state;

  const onOffBtn = document.getElementById("light-onoff");
  const briSlider = document.getElementById("brightness-slider");
  const briValue = document.getElementById("brightness-value");

  if (onOffBtn) {
    const isOn = !!st.on;
    onOffBtn.textContent = isOn ? "Turn Off" : "Turn On";
    onOffBtn.dataset.on = isOn ? "1" : "0";
  }

  if (briSlider && typeof st.bri === "number") {
    briSlider.value = String(st.bri);
  }
  if (briValue && typeof st.bri === "number") {
    const pct = Math.round((st.bri / 254) * 100);
    briValue.textContent = `(${pct}%)`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const lightSelect = document.getElementById("light-select");
  const onOffBtn = document.getElementById("light-onoff");
  const briSlider = document.getElementById("brightness-slider");
  const whitePresets = document.getElementById("white-presets");
  const colorPresets = document.getElementById("color-presets");
  const startFnBtn = document.getElementById("start-function");
  const stopFnBtn = document.getElementById("stop-function");

  chrome.runtime.sendMessage({ type: "INIT_POPUP" }, (response = {}) => {
    if (chrome.runtime.lastError) {
      setStatus(`Error: ${chrome.runtime.lastError.message}`);
      return;
    }
    const { lights, functions, error } = response;
    if (error) {
      setStatus(`Error: ${error}`);
      return;
    }

    populateLightsSelect(lights || {});
    populateFunctionsSelect(functions || []);

    const firstId = getSelectedLightId();
    if (firstId) {
      chrome.runtime.sendMessage(
        { type: "GET_LIGHT_STATE", lightId: firstId },
        (resp = {}) => {
          if (resp.light) updateLightUI(resp.light);
          if (resp.error) setStatus(`Error: ${resp.error}`);
          else setStatus("Ready.");
        }
      );
    } else {
      setStatus("No lights found.");
    }
  });

  lightSelect.addEventListener("change", () => {
    const id = getSelectedLightId();
    if (!id) return;
    setStatus("Loading light state...");
    chrome.runtime.sendMessage(
      { type: "GET_LIGHT_STATE", lightId: id },
      (resp = {}) => {
        if (resp.error) {
          setStatus(`Error: ${resp.error}`);
        } else {
          updateLightUI(resp.light);
          setStatus("Ready.");
        }
      }
    );
  });

  onOffBtn.addEventListener("click", () => {
    const id = getSelectedLightId();
    if (!id) return;
    const isOn = onOffBtn.dataset.on === "1";
    const newOn = !isOn;
    setStatus("Updating power...");

    chrome.runtime.sendMessage(
      {
        type: "SET_LIGHT_STATE",
        lightId: id,
        state: { on: newOn }
      },
      (resp = {}) => {
        if (resp.error) {
          setStatus(`Error: ${resp.error}`);
        } else {
          chrome.runtime.sendMessage(
            { type: "GET_LIGHT_STATE", lightId: id },
            (r2 = {}) => {
              if (r2.light) updateLightUI(r2.light);
              setStatus("Ready.");
            }
          );
        }
      }
    );
  });

  briSlider.addEventListener("input", () => {
    const briValue = document.getElementById("brightness-value");
    const val = parseInt(briSlider.value, 10);
    const pct = Math.round((val / 254) * 100);
    if (briValue) briValue.textContent = `(${pct}%)`;
  });

  briSlider.addEventListener("change", () => {
    const id = getSelectedLightId();
    if (!id) return;
    const val = parseInt(briSlider.value, 10);
    setStatus("Updating brightness...");

    chrome.runtime.sendMessage(
      {
        type: "SET_LIGHT_STATE",
        lightId: id,
        state: { bri: val, on: true }
      },
      (resp = {}) => {
        if (resp.error) {
          setStatus(`Error: ${resp.error}`);
        } else {
          chrome.runtime.sendMessage(
            { type: "GET_LIGHT_STATE", lightId: id },
            (r2 = {}) => {
              if (r2.light) updateLightUI(r2.light);
              setStatus("Ready.");
            }
          );
        }
      }
    );
  });

  whitePresets.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const ct = parseInt(btn.dataset.ct, 10);
    const id = getSelectedLightId();
    if (!id || Number.isNaN(ct)) return;

    setStatus(`Setting white preset (${ct})...`);
    chrome.runtime.sendMessage(
      {
        type: "SET_LIGHT_STATE",
        lightId: id,
        state: { on: true, ct }
      },
      (resp = {}) => {
        if (resp.error) setStatus(`Error: ${resp.error}`);
        else {
          chrome.runtime.sendMessage(
            { type: "GET_LIGHT_STATE", lightId: id },
            (r2 = {}) => {
              if (r2.light) updateLightUI(r2.light);
              setStatus("Ready.");
            }
          );
        }
      }
    );
  });

  colorPresets.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const hue = parseInt(btn.dataset.hue, 10);
    const id = getSelectedLightId();
    if (!id || Number.isNaN(hue)) return;

    setStatus(`Setting color (${hue})...`);
    chrome.runtime.sendMessage(
      {
        type: "SET_LIGHT_STATE",
        lightId: id,
        state: { on: true, hue, sat: 254 }
      },
      (resp = {}) => {
        if (resp.error) setStatus(`Error: ${resp.error}`);
        else {
          chrome.runtime.sendMessage(
            { type: "GET_LIGHT_STATE", lightId: id },
            (r2 = {}) => {
              if (r2.light) updateLightUI(r2.light);
              setStatus("Ready.");
            }
          );
        }
      }
    );
  });

  startFnBtn.addEventListener("click", () => {
    const fnName = getSelectedFunctionName();
    const lightId = getSelectedLightId();
    if (!fnName || !lightId) return;

    setStatus(`Starting function: ${fnName}...`);
    chrome.runtime.sendMessage(
      {
        type: "START_FUNCTION",
        functionName: fnName,
        lightId
      },
      (resp = {}) => {
        if (resp.error) setStatus(`Error: ${resp.error}`);
        else setStatus(`Function "${fnName}" running...`);
      }
    );
  });

  stopFnBtn.addEventListener("click", () => {
    const fnName = getSelectedFunctionName();
    const lightId = getSelectedLightId();
    if (!fnName || !lightId) return;

    setStatus(`Stopping function: ${fnName}...`);
    chrome.runtime.sendMessage(
      {
        type: "STOP_FUNCTION",
        functionName: fnName,
        lightId
      },
      (resp = {}) => {
        if (resp.error) setStatus(`Error: ${resp.error}`);
        else setStatus("Function stopped.");
      }
    );
  });
});