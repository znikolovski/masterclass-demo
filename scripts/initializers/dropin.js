/** Runs a drop-in initializer once per page (re-runs after prerender activation). */
export default function initializeDropin(cb) {
  let initialized = false;
  const init = async (force = false) => {
    if (initialized && !force) return;
    await cb();
    initialized = true;
  };
  document.addEventListener('prerenderingchange', () => init(true), { once: true });
  return init;
}
