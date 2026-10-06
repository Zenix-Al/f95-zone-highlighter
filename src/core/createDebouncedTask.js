/**
 * Creates a debounced function that delays invoking `task` until after `delay`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * @param {function} task The function to debounce.
 * @param {number} [delay=100] The number of milliseconds to delay.
 * @returns {function} Returns the new debounced function, with `cancel()` to drop a pending call.
 */
export function createDebouncedTask(task, delay = 100) {
  let timeoutId = null;

  const debouncedTask = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      task.apply(this, args);
    }, delay);
  };
  debouncedTask.cancel = () => {
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  return debouncedTask;
}
