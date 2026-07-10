# Task Queue (`taskQueue.js`)

The `taskQueue` module provides a way to process a sequence of tasks with a fixed delay, mitigating layout thrashing and CPU spikes.

## Creation
```javascript
import { createTaskQueue } from "../../core/taskQueue.js";

const queue = createTaskQueue({ delay: 100, name: "TileRenderer" });
```

## Adding Tasks
Tasks are added using a unique key. If a task with the same key is already in the queue, it is ignored (effectively debouncing it).

```javascript
queue.add("render-tile-1", async () => {
    // Heavy DOM work
}, generationId);
```

## Generations (Stale Work Invalidation)
The queue supports "generations". When navigating in an SPA, the generation increments. If the queue is processing a task from an older generation, it will drop it. This is essential for preventing the processing of DOM nodes that no longer exist on the screen.

```javascript
queue.setGeneration(newGenerationId);
```
