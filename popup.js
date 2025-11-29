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

// Map from hue to CSS color
function hueToCss(hue) {
  if (hue == null) return "#222222";
  const h = Number(hue);
  const deg = Math.round((h / 65535) * 360);
  return `hsl(${deg}, 100%, 50%)`;
}

function ctToCss(ct) {
  if (ct == null) return "#222222";
  const c = Number(ct);
  if (c >= 450) return "#ffb74d";
  if (c >= 340) return "#ffe0b2";
  return "#bbdefb";
}

// Light dropdown background = current color * brightness, or black when off
function updateLightDropdownColor(st) {
  const select = document.getElementById("light-select");
  if (!select || !st) return;

  if (!st.on) {
    select.style.background = "#000000";
    select.style.color = "#ffffff";
    return;
  }

  let baseCss;
  if (st.colormode === "ct" && st.ct != null) {
    baseCss = ctToCss(st.ct);
  } else if ((st.colormode === "hs" || st.hue != null) && st.hue != null) {
    baseCss = hueToCss(st.hue);
  } else {
    baseCss = "#444444";
  }

  const bri = typeof st.bri === "number" ? st.bri : 254;
  const factor = Math.max(0.2, Math.min(1, bri / 254));

  const match = baseCss.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
  let finalCss = baseCss;
  if (match) {
    const deg = parseInt(match[1], 10);
    const sat = parseFloat(match[2]);
    const light = parseFloat(match[3]);
    const adjustedLight = Math.max(10, Math.min(60, light * factor));
    finalCss = `hsl(${deg}, ${sat}%, ${adjustedLight}%)`;
  }

  select.style.background = finalCss;
  select.style.color = "#ffffff";
}

// Helper to set readable text color depending on background
function setButtonColorWithContrast(button) {
  const bg = button.dataset.color;
  if (!bg) return;
  button.style.backgroundColor = bg;

  const hex = bg.replace("#", "");
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    button.style.color = luminance > 0.6 ? "#000000" : "#ffffff";
  }
}

function updateFunctionButtonText(running) {
  const fnSelect = document.getElementById("function-select");
  const fnToggle = document.getElementById("function-toggle");
  if (!fnToggle || !fnSelect) return;

  const fnName = fnSelect.value;
  const fnLabel =
    fnSelect.selectedOptions[0]?.textContent || "Function";

  if (!fnName) {
    fnToggle.textContent = "No function selected";
    fnToggle.classList.remove("running");
    fnToggle.disabled = true;
    return;
  }

  fnToggle.disabled = false;

  if (running) {
    fnToggle.textContent = `Stop ${fnLabel}`;
    fnToggle.classList.add("running");
  } else {
    fnToggle.textContent = `Start ${fnLabel}`;
    fnToggle.classList.remove("running");
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
    onOffBtn.textContent = isOn ? "ON" : "OFF";
    onOffBtn.dataset.on = isOn ? "1" : "0";
    onOffBtn.classList.toggle("on", isOn);
    onOffBtn.classList.toggle("off", !isOn);
  }

  if (briSlider && typeof st.bri === "number") {
    briSlider.value = String(st.bri);
  }
  if (briValue && typeof st.bri === "number") {
    const pct = Math.round((st.bri / 254) * 100);
    briValue.textContent = `(${pct}%)`;
  }

  updateLightDropdownColor(st);
}

document.addEventListener("DOMContentLoaded", () => {
  const lightSelect = document.getElementById("light-select");
  const onOffBtn = document.getElementById("light-onoff");
  const briSlider = document.getElementById("brightness-slider");
  const whitePresets = document.getElementById("white-presets");
  const colorPresets = document.getElementById("color-presets");
  const fnSelect = document.getElementById("function-select");
  const fnToggle = document.getElementById("function-toggle");

  // Style color preset buttons
  Array.from(
    colorPresets.querySelectorAll("button[data-color]")
  ).forEach(setButtonColorWithContrast);

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
    populateFunctionsSelect(functions || {});

    updateFunctionButtonText(false);

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

    setStatus("Setting color...");
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

  fnSelect.addEventListener("change", () => {
    updateFunctionButtonText(false);
  });

  fnToggle.addEventListener("click", () => {
    const fnName = getSelectedFunctionName();
    const lightId = getSelectedLightId();
    if (!fnName || !lightId) return;

    const isRunning = fnToggle.classList.contains("running");

    if (isRunning) {
      setStatus(`Stopping function: ${fnName}...`);
      chrome.runtime.sendMessage(
        {
          type: "STOP_FUNCTION",
          functionName: fnName,
          lightId
        },
        (resp = {}) => {
          if (resp.error) setStatus(`Error: ${resp.error}`);
          else {
            updateFunctionButtonText(false);
            chrome.runtime.sendMessage(
              { type: "GET_LIGHT_STATE", lightId },
              (r2 = {}) => {
                if (r2.light) updateLightUI(r2.light);
                setStatus("Function stopped.");
              }
            );
          }
        }
      );
    } else {
      setStatus(`Starting function: ${fnName}...`);
      chrome.runtime.sendMessage(
        {
          type: "START_FUNCTION",
          functionName: fnName,
          lightId
        },
        (resp = {}) => {
          if (resp.error) setStatus(`Error: ${resp.error}`);
          else {
            updateFunctionButtonText(true);
            chrome.runtime.sendMessage(
              { type: "GET_LIGHT_STATE", lightId },
              (r2 = {}) => {
                if (r2.light) updateLightUI(r2.light);
                setStatus(`Function "${fnName}" running...`);
              }
            );
          }
        }
      );
    }
  });
});