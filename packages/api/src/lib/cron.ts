export function startCron(
  _name: string,
  intervalMs: number,
  fn: () => Promise<void>,
): () => Promise<void> {
  let running = false;
  let inFlight: Promise<void> | null = null;

  const tick = async () => {
    if (running) return;
    running = true;
    inFlight = fn().finally(() => {
      running = false;
      inFlight = null;
    });
    await inFlight;
  };

  const handle = setInterval(() => void tick(), intervalMs);
  (handle as { unref?: () => void }).unref?.();
  void tick();

  return async () => {
    clearInterval(handle);
    if (inFlight) await inFlight;
  };
}
