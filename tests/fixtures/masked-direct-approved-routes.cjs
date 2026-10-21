"use strict";

// Immutable inputs shared by route-classifier and controller-policy tests.
// Each caller still creates its own DOM/session state and module instance.
module.exports = Object.freeze([
  ["krakenfiles.com", "https://krakenfiles.com/view/a/file.html"],
  ["delafil.se", "https://delafil.se/0123456789abcdef/file.zip"],
  ["download.gg", "https://download.gg/en-us/file-example"],
  ["uploadhaven.com", "https://uploadhaven.com/download/example"],
  ["pixeldrain.com", "https://pixeldrain.com/u/K3kVDJSJ"],
].map((entry) => Object.freeze(entry)));
