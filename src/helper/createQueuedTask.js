export function createQueuedTask(fn, delay = 100) {
  let timer = null;

  return function (...args) {
    if (timer) clearTimeout(timer); // Reset the timer if called again
    timer = setTimeout(() => {
      fn(...args); // Execute the function
      timer = null; // Clear reference after execution
    }, delay);
  };
}
