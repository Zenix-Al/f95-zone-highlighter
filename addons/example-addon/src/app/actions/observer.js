import {
  waitForObserver,
  watchObserver,
  unwatchObserver,
} from "../../api/observer.js";
import { EXAMPLE_OBSERVER_ID } from "../../constants.js";

export function createObserverActions({ core, state, createObserverTestNode }) {
  return {
    "observer-watch": async () => {
      const result = await watchObserver(core, EXAMPLE_OBSERVER_ID);
      if (result?.ok) state.observer.isWatching = true;
      return result;
    },
    "observer-wait": () =>
      waitForObserver(core, `${EXAMPLE_OBSERVER_ID}-wait`, "body", 1000),
    "observer-add-node": async () => {
      createObserverTestNode();
      return { ok: true, value: "observer test node appended" };
    },
    "observer-unwatch": async () => {
      const result = await unwatchObserver(core, EXAMPLE_OBSERVER_ID);
      if (result?.ok) state.observer.isWatching = false;
      return result;
    },
  };
}
