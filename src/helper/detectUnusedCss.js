// used to detect unused CSS selectors in the userscript CSS, not for import/export
(function checkUnusedCSS() {
  // find the style tag that contains your userscript CSS
  const style = [...document.querySelectorAll("style")].find((s) =>
    s.textContent.includes("#tag-config-button")
  );

  if (!style) {
    console.error("Userscript CSS <style> not found");
    return;
  }

  const css = style.textContent;

  const selectors = new Set();

  css
    .replace(/\/\*[\s\S]*?\*\//g, "") // strip comments
    .replace(/@keyframes[\s\S]*?\}/g, "")
    .replace(/@media[\s\S]*?\}\s*\}/g, "")
    .split("}")
    .forEach((block) => {
      const sel = block.split("{")[0];
      if (!sel) return;

      sel.split(",").forEach((s) => {
        s = s.trim();
        if (s.startsWith(".") || s.startsWith("#")) {
          selectors.add(s);
        }
      });
    });

  const unused = [];

  selectors.forEach((sel) => {
    try {
      if (!document.querySelector(sel)) {
        unused.push(sel);
      }
    } catch {
      // invalid selector, ignore
    }
  });

  console.group(`Unused CSS selectors (${unused.length})`);
  unused.forEach((s) => console.log(s));
  console.groupEnd();

  console.log(`Checked ${selectors.size} selectors`);
})();
