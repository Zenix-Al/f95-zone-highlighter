# State Manager (`StateManager.js`)

The `StateManager.js` provides a centralized, synchronous state management mechanism with pub/sub capabilities.

## Creating a Manager
The global config state uses this, but you can also create local feature state managers.
```javascript
import { createStateManager } from "../../core/StateManager.js";

const state = createStateManager({
  theme: "dark",
  user: { name: "Guest" }
}, {
  name: "MyFeatureState"
});
```

## Access and Mutation
State is strictly modified using paths (via `utils/objectPath.js`).

```javascript
state.get("user.name"); // "Guest"

// Set state and notify subscribers
state.set("user.name", "Admin"); 
```

## Subscriptions
You can subscribe to changes at specific paths. If a parent path is modified, relevant child path subscriptions are notified.

```javascript
const unsubscribe = state.subscribe("user.name", (newValue) => {
    console.log("User name changed to", newValue);
});

// Later, cleanup:
unsubscribe();
```

## Snapshot
`getState()` returns a serializable snapshot of the current state, stripping out non-serializable objects (like DOM nodes or circular references). This is great for debugging or persisting state.
