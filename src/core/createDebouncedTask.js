/**
 * Creates a debounced function that delays invoking `task` until after `delay`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * @param {function} task The function to debounce.
 * @param {number} [delay=100] The number of milliseconds to delay.
 * @returns {function} Returns the new debounced function.
 */
export function createDebouncedTask(task, delay = 100) {
  let timeoutId = null;

  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      task.apply(this, args);
    }, delay);
  };
}
