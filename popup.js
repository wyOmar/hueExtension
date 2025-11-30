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

/**
 * Compute whether black or white text will be more readable
 * over a given background color string (hex or rgb/hsl).
 */
function pickTextColorForBackground(bgColor) {
  if (!bgColor) return "#ffffff";

  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#ffffff";

  ctx.fillStyle = bgColor;
  const computed = ctx.fillStyle;

  // Handle hex (#rrggbb) and rgb(a)
  let r = 0;
  let g = 0;
  let b = 0;

  if (computed.startsWith("#")) {
    const hex = computed.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (computed.startsWith("rgb")) {
    const nums = computed
      .replace(/rgba?\(/, "")
      .replace(/\)/, "")
      .split(",")
      .map((x) => parseFloat(x.trim()));
    [r, g, b] = nums;
  } else if (computed.startsWith("hsl")) {
    // let the browser convert HSL to RGB via fillStyle
    // we already assigned it above, so just re-read as RGB
    ctx.fillStyle = computed;
    const rgb = ctx.fillStyle;
    if (rgb.startsWith("rgb")) {
      const nums = rgb
        .replace(/rgba?\(/, "")
        .replace(/\)/, "")
        .split(",")
        .map((x) => parseFloat(x.trim()));
      [r, g, b] = nums;
    }
  }

  const rl = r / 255;
  const gl = g / 255;
  const bl = b / 255;

  const luminance = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;

  // threshold tuned a bit higher so bright presets use dark text
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

/**
 * For preset buttons that specify a color with data-color,
 * set background and compute a readable text color.
 */
function setButtonColorWithContrast(button) {
  const bg = button.dataset.color;
  if (!bg) return;
  button.style.backgroundColor = bg;
  button.style.color = pickTextColorForBackground(bg);
}

/**
 * For CT-based preset buttons, use their current background color
 * (from CSS) and assign readable text color.
 */
function setCtButtonContrast(button) {
  const style = getComputedStyle(button);
  const bg = style.backgroundColor;
  button.style.color = pickTextColorForBackground(bg);
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

  const match = baseCss.match(
    /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/
  );
  let finalCss = baseCss;
  if (match) {
    const deg = parseInt(match[1], 10);
    const sat = parseFloat(match[2]);
    const light = parseFloat(match[3]);
    const adjustedLight = Math.max(10, Math.min(60, light * factor));
    finalCss = `hsl(${deg}, ${sat}%, ${adjustedLight}%)`;
  }

  select.style.background = finalCss;
  select.style.color = pickTextColorForBackground(finalCss);
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
  const colorPresets = document.getElementById("color-presets");
  const fnSelect = document.getElementById("function-select");
  const fnToggle = document.getElementById("function-toggle");

  // Style hue-based color preset buttons
  Array.from(colorPresets.querySelectorAll("button[data-color]")).forEach(
    setButtonColorWithContrast
  );

  // Also ensure CT-based buttons (Warm/Neutral/Cool) have readable text
  Array.from(colorPresets.querySelectorAll("button[data-ct]")).forEach(
    setCtButtonContrast
  );

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
      // Inform background which light is initially selected
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

    // Inform background about the current selected light
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

  // Unified presets handler: CT or HUE depending on attributes
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

  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      if (!target) return;

      tabs.forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });

      panels.forEach((panel) => {
        const name = panel.dataset.tabPanel;
        panel.classList.toggle("active", name === target);
      });
    });
  });

  /*
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const body = document.body;
      const current = body.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      body.setAttribute("data-theme", next);
      themeToggle.textContent = next === "dark" ? "☾" : "☀";
    });
  }
  */
});