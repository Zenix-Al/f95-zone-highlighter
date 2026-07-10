# Page Bridge (`pageBridge.js`)

The `pageBridge.js` module provides a secure communication channel between the isolated userscript environment (Core) and the actual website's context (the Web page).

## Purpose
Userscripts generally run in an isolated sandbox to prevent conflicts with the host page's variables and functions. However, sometimes a feature absolutely *must* access a variable or function defined on the host page's `window` object (e.g., retrieving an authentication token, or interfacing with the forum's native JavaScript APIs).

`pageBridge.js` allows features to bridge that gap safely without exposing the entire userscript to the page.

## Usage
*When building features, only use `pageBridge.js` if you absolutely need data that exists on the host's `window` object and cannot be retrieved through the DOM.*
