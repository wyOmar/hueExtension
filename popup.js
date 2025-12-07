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
  if (!select) return;
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
  if (!select) return;
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

function updateFunctionButtonText(running) {
  const fnSelect = document.getElementById("function-select");
  const fnToggle = document.getElementById("function-toggle");
  if (!fnToggle || !fnSelect) return;

  const fnName = fnSelect.value;
  const fnLabel =
    fnSelect.selectedOptions[0]?.textContent || "Function";

  if (!fnName) {
    fnToggle.textContent = "No function selected";
    fnToggle.disabled = true;
    return;
  }

  fnToggle.disabled = false;

  if (running) {
    fnToggle.textContent = `Stop ${fnLabel}`;
  } else {
    fnToggle.textContent = `Start ${fnLabel}`;
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
  const colorPresets = document.getElementById("color-presets");
  const fnSelect = document.getElementById("function-select");
  const fnToggle = document.getElementById("function-toggle");

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
      chrome.runtime.sendMessage({
        type: "SET_CURRENT_LIGHT",
        lightId: firstId
      });

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

    chrome.runtime.sendMessage({
      type: "SET_CURRENT_LIGHT",
      lightId: id
    });

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

  colorPresets.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = getSelectedLightId();
    if (!id) return;

    const ctAttr = btn.dataset.ct;
    const hueAttr = btn.dataset.hue;

    if (ctAttr) {
      const ct = parseInt(ctAttr, 10);
      if (Number.isNaN(ct)) return;

      setStatus("Setting white...");
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
      return;
    }

    if (hueAttr) {
      const hue = parseInt(hueAttr, 10);
      if (Number.isNaN(hue)) return;

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
    }
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
            fnToggle.classList.remove("running");
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
            fnToggle.classList.add("running");
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

  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!target) return;

      tabs.forEach((t) => {
        t.setAttribute(
          "aria-selected",
          t === tab ? "true" : "false"
        );
      });

      panels.forEach((panel) => {
        const name = panel.dataset.tabPanel;
        panel.hidden = name !== target;
      });
    });
  });
});