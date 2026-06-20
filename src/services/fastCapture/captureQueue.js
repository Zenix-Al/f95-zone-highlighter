import { nextFrame } from "../../core/frameBudget.js";

export function createCaptureQueue(processJob, { limit = 20, budgetMs = 4 } = {}) {
  const jobs = new Map();
  let draining = false;

  async function drain() {
    let frameStartedAt = Date.now();
    while (jobs.size > 0) {
      const key = jobs.keys().next().value;
      const job = jobs.get(key);
      jobs.delete(key);
      processJob(job);
      if (Date.now() - frameStartedAt >= budgetMs && jobs.size > 0) {
        await nextFrame();
        frameStartedAt = Date.now();
      }
    }
    draining = false;
  }

  return {
    enqueue(job) {
      const key = `${job.transport}|${job.url}`;
      if (jobs.has(key)) jobs.delete(key);
      jobs.set(key, job);
      while (jobs.size > limit) jobs.delete(jobs.keys().next().value);
      if (draining) return;
      draining = true;
      const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout;
      schedule(() => void drain());
    },
    clear() {
      jobs.clear();
      draining = false;
    },
  };
}
