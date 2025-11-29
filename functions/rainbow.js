export const name = "rainbow";
export const displayName = "Rainbow Cycle";

export async function run(lightId, setLightState) {
  let running = true;
  let i = 0;

  const STEP_DELAY_MS = 200;
  const RAINBOW_HUES = [
    0,
    8000,
    16000,
    25500,
    35000,
    45000,
    50000,
    56000,
    65000
  ];

  async function step() {
    if (!running) return;

    const hue = RAINBOW_HUES[i % RAINBOW_HUES.length];

    try {
      await setLightState(lightId, {
        on: true,
        hue,
        sat: 254,
        bri: 254,
        transitiontime: 3
      });
    } catch (err) {
      console.error("[rainbow] Error setting light", lightId, err);
    }

    i += 1;
    if (running) {
      setTimeout(step, STEP_DELAY_MS);
    }
  }

  step();

  return {
    stop() {
      running = false;
    }
  };
}