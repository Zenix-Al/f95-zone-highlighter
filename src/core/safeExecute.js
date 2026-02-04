//for later use whenever i want to update the code to safely execute functions or just for new features
export function safeExecute(fn, context = null, ...args) {
  try {
    return fn.apply(context, args);
  } catch (err) {
    console.error(`Error in ${fn.name || "anonymous function"}:`, err);
    // optional: show non-intrusive UI notification
  }
}
