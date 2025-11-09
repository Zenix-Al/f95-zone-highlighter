import { processAllTiles } from "../cores/latest";
import { autoRefreshClick, webNotifClick } from "../cores/thread";

// New helper function
export function verifyTilesAfterLoad(retryDelay = 2000, maxRetries = 3) {
  let retries = 0;

  function checkTiles() {
    const tiles = document.getElementsByClassName("resource-tile");
    let hasModified = false;

    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].dataset.modified === "true") {
        hasModified = true;
        break;
      }
    }

    if (!hasModified) {
      console.warn("Tiles not modified yet, forcing manual trigger...");
      processAllTiles();
      autoRefreshClick();
      webNotifClick();

      retries++;
      if (retries < maxRetries) {
        setTimeout(checkTiles, retryDelay);
      } else {
        console.warn("Reached max retries, stopping verification.");
      }
    }
  }

  // Run first check
  setTimeout(checkTiles, retryDelay);
}
