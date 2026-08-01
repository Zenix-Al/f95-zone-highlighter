"use strict";

module.exports = function registerThreadUtilityContent(context) {
  const {
    ROOT,
    Window,
    assert,
    fs,
    loadModule,
    path,
    runTest,
  } = context;

  function parser() {
    return loadModule(
      "addons/thread-utility-addon/src/domain/content/parser.js",
    );
  }

  function contentRoot(html) {
    const window = new Window({ url: "https://f95zone.to/threads/fixture.1/" });
    window.document.body.innerHTML = html;
    return {
      root: window.document.querySelector(".bbWrapper"),
      window,
    };
  }

  function availableSection(id, text, html = `<p>${text}</p>`) {
    return Object.freeze({
      id,
      available: true,
      html,
      text,
      nodeCount: 1,
      truncated: false,
    });
  }

  function renderState(overrides = {}) {
    return {
      displayTags: [],
      utilities: [{ id: "copy-title", family: "fixed", label: "Copy title" }],
      settings: { visibleTagLimit: 8, descriptionPreviewLines: 4 },
      content: {
        description: availableSection("description", "Long ".repeat(150)),
        installation: availableSection("installation", "Extract and run."),
      },
      ui: {
        tagsExpanded: false,
        openContentSection: null,
      },
      ...overrides,
    };
  }

  runTest("THREAD-UTILITY-CONTENT-01 isolates canonical Overview and Installation", () => {
    const html = fs.readFileSync(path.join(ROOT, "addons/reference/sample.html"), "utf8");
    const fixture = contentRoot(html);
    try {
      const { parseContentSections } = parser();
      const sections = parseContentSections(fixture.root);
      assert.strictEqual(sections.description.available, true);
      assert.match(sections.description.text, /dawn of a new era/i);
      assert.match(sections.description.text, /battle for Osaka/i);
      assert.doesNotMatch(
        sections.description.text,
        /Thread Updated|Release Date|Developer|Version|VNDB|Wiki|Other Games|DOWNLOAD/i,
      );
      assert.strictEqual(sections.installation.available, true);
      assert.match(sections.installation.text, /Extract and run/i);
      assert.match(sections.installation.text, /xsystem35\.exe/i);
      assert.doesNotMatch(sections.installation.text, /DATANODES|GOFILE|DOWNLOAD/i);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-CONTENT-01 supports flat headings and titled spoilers", () => {
    const fixture = contentRoot(`
      <div class="bbWrapper">
        <h3>Description</h3>
        <p>Flat description.</p>
        <h3>Developer</h3>
        <p>Do not include this.</p>
        <div class="bbCodeSpoiler">
          <button class="bbCodeSpoiler-button" title="How to install">Open</button>
          <div class="bbCodeSpoiler-content">
            <ol><li>Extract.</li><li><strong>Run</strong> the game.</li></ol>
          </div>
        </div>
        <h3>Downloads</h3>
        <p>Do not include downloads.</p>
      </div>
    `);
    try {
      const sections = parser().parseContentSections(fixture.root);
      assert.strictEqual(sections.description.text, "Flat description.");
      assert.match(sections.installation.text, /Extract/);
      assert.match(sections.installation.html, /<ol>/);
      assert.match(sections.installation.html, /<strong>Run<\/strong>/);
      assert.doesNotMatch(sections.installation.text, /downloads/i);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-CONTENT-01 degrades when sections are absent", () => {
    const fixture = contentRoot(
      '<div class="bbWrapper"><p>Unrecognized opening-post content.</p></div>',
    );
    try {
      const sections = parser().parseContentSections(fixture.root);
      assert.deepStrictEqual(
        {
          description: sections.description.available,
          installation: sections.installation.available,
        },
        { description: false, installation: false },
      );
      assert.strictEqual(
        parser().parseContentSections(null).description.available,
        false,
      );
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-CONTENT-01 emits only allowed safe structures", () => {
    const fixture = contentRoot(`
      <div class="bbWrapper">
        <strong>Description:</strong>
        <p style="color:red" onclick="bad()">Text <i>italic</i>
          <a href="https://example.com/path" style="x">safe</a>
          <a href="javascript:alert(1)">unsafe</a>
          <img src="https://example.com/image.png">
          <script>alert(1)</script>
          <button class="f95ue-addon-resolve-btn">Resolve</button>
        </p>
        <h3>Version</h3>
      </div>
    `);
    try {
      const section = parser().parseContentSections(fixture.root).description;
      assert.match(section.html, /<p>/);
      assert.match(section.html, /<em>italic<\/em>/);
      assert.match(section.html, /href="https:\/\/example\.com\/path"/);
      assert.doesNotMatch(section.html, /style=|onclick=|javascript:|<img|<script|<button/i);
      const parsed = new Window().document;
      parsed.body.innerHTML = section.html;
      const tags = [...parsed.body.querySelectorAll("*")].map((node) =>
        node.tagName.toLowerCase());
      assert.ok(tags.every((tag) =>
        ["p", "br", "ul", "ol", "li", "strong", "em", "a"].includes(tag)));
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-CONTENT-01 bounds oversized normalized output", () => {
    const fixture = contentRoot(`
      <div class="bbWrapper">
        <b>Overview</b>
        <p>${"Oversized content ".repeat(1500)}</p>
        <b>Developer</b>
      </div>
    `);
    try {
      const { CONTENT_LIMITS, parseContentSections } = parser();
      const section = parseContentSections(fixture.root).description;
      assert.strictEqual(section.truncated, true);
      assert.ok(section.text.length <= CONTENT_LIMITS.text);
      assert.ok(section.nodeCount <= CONTENT_LIMITS.nodes);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-CONTENT-01 stops installation at sibling post sections", () => {
    const fixture = contentRoot(`
      <div class="bbWrapper">
        <b>Description</b>:<br>Short description.
        <b>Installation</b>:<br>1. Extract and run.
        <b>Changelogs:</b><br>v0.1 initial release
        <b>Developer Notes:</b><br>Features and other notes.
      </div>
    `);
    try {
      const sections = parser().parseContentSections(fixture.root);
      assert.strictEqual(sections.description.text, "Short description.");
      assert.strictEqual(sections.installation.text, "1. Extract and run.");
      assert.doesNotMatch(sections.installation.text, /Changelog|Developer Notes|Features/i);
      assert.doesNotMatch(sections.description.text, /^:/);
      assert.doesNotMatch(sections.installation.text, /^:/);
    } finally {
      fixture.window.close();
    }
  });

  runTest("THREAD-UTILITY-CONTENT-01 renders collapsed disclosures, copy, and accordion state", async () => {
    const { renderPalette } = loadModule(
      "addons/thread-utility-addon/src/ui/palette.js",
    );
    const state = renderState();
    const collapsed = renderPalette(state);
    assert.match(collapsed, />Description ><\/button>/);
    assert.match(collapsed, />Installation ><\/button>/);
    assert.doesNotMatch(collapsed, /Copy description/);
    assert.doesNotMatch(collapsed, /id="thread-utility-description-content"/);
    assert.doesNotMatch(collapsed, /id="thread-utility-installation-content"/);

    const actions = [];
    const { createThreadUtilityUiController } = loadModule(
      "addons/thread-utility-addon/src/app/uiController.js",
      { loader: { ".css": "text" } },
    );
    Object.assign(state, {
      enabled: true,
      ui: {
        ...state.ui,
        dialogOpen: true,
        dialogOpening: false,
        dialogGeneration: 1,
        launcherMounted: false,
        styleRegistered: false,
        tagsExpanded: true,
      },
    });
    const utilityReference = state.utilities;
    const controller = createThreadUtilityUiController({
      core: {
        invokeCoreAction: async (action, payload) => {
          actions.push({ action, payload });
          return { ok: true };
        },
      },
      state,
      bindings: {
        bindDialogEvents() {},
        bindLauncherEvents() {},
        unbindDialogEvents() {},
        unbindLauncherEvents() {},
      },
      isTerminal: () => false,
    });

    await controller.toggleContentSection("description");
    assert.strictEqual(state.ui.openContentSection, "description");
    assert.match(actions.at(-1).payload.html, />Description v<\/button>/);
    assert.doesNotMatch(actions.at(-1).payload.html, /Copy description/);
    await controller.toggleContentSection("installation");
    assert.strictEqual(state.ui.openContentSection, "installation");
    assert.match(actions.at(-1).payload.html, /id="thread-utility-installation-content"/);
    assert.strictEqual(state.ui.tagsExpanded, true);
    assert.strictEqual(state.utilities, utilityReference);

    const shortState = renderState({
      content: {
        description: availableSection("description", "Short description."),
        installation: { available: false },
      },
    });
    assert.match(renderPalette(shortState), />Description ><\/button>/);
  });
};
