"use strict";

module.exports = function registerMaskedDirectMaskedStandaloneRuntime(context) {
  const { assert, createDomSandbox, loadModule, runTest } = context;

  function preparePage(sandbox) {
    sandbox.document.body.innerHTML =
      '<div class="leaving"><p class="leaving-text">Leaving</p></div>' +
      '<div id="loading" style="display:none"></div>' +
      '<div id="captcha" style="display:none"></div>' +
      '<div id="error" style="display:none"></div>';
  }

  function deferredRequest() {
    let resolve;
    let reject;
    const promise = new Promise((resolveValue, rejectValue) => {
      resolve = resolveValue;
      reject = rejectValue;
    });
    promise.abortCount = 0;
    promise.abort = () => {
      promise.abortCount += 1;
    };
    return { promise, resolve, reject };
  }

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 shares one operation and redirects once",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/masked/example");
      try {
        preparePage(sandbox);
        const pending = deferredRequest();
        let requests = 0;
        const destinations = [];
        const { createMaskedPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
        );
        const controller = createMaskedPageController({
          addTeardown() {},
          readThreadFlags: async () => ({ skipMaskedLink: true }),
          normalizeUrl: (value) => value,
          resolveMaskedLink() {
            requests += 1;
            return pending.promise;
          },
          deliverDestination: async (url) => destinations.push(url),
        });
        const first = controller.enableMaskedPageHooks({
          isEnabled: true,
          isBlockedByCore: false,
        });
        const second = controller.enableMaskedPageHooks({
          isEnabled: true,
          isBlockedByCore: false,
        });
        await Promise.resolve();
        assert.strictEqual(requests, 1);
        pending.resolve({ status: "ok", msg: "https://pixeldrain.com/u/a" });
        await Promise.all([first, second]);
        assert.deepStrictEqual(destinations, ["https://pixeldrain.com/u/a"]);
        assert.strictEqual(controller.getOperationState(), "redirecting");
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 clicks Continue once without transport",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/masked/example");
      try {
        sandbox.document.body.innerHTML = '<a class="host_link">Continue</a>';
        let clicks = 0;
        sandbox.document.querySelector("a").click = () => {
          clicks += 1;
        };
        const { createMaskedPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
        );
        const controller = createMaskedPageController({
          addTeardown() {},
          readThreadFlags: async () => ({ skipMaskedLink: true }),
          normalizeUrl: (value) => value,
          resolveMaskedLink() {
            throw new Error("transport must not run");
          },
        });
        await controller.enableMaskedPageHooks({ isEnabled: true, isBlockedByCore: false });
        await controller.enableMaskedPageHooks({ isEnabled: true, isBlockedByCore: false });
        assert.strictEqual(clicks, 1);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 renders transport and response failures locally",
    async () => {
      for (const response of [new Error("http"), { status: "ok", msg: "bad" }, null]) {
        const sandbox = createDomSandbox("https://f95zone.to/masked/example");
        try {
          preparePage(sandbox);
          const { createMaskedPageController } = loadModule(
            "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
          );
          const controller = createMaskedPageController({
            addTeardown() {},
            readThreadFlags: async () => ({ skipMaskedLink: true }),
            normalizeUrl: (value) => value === "bad" ? "" : value,
            resolveMaskedLink: async () => {
              if (response instanceof Error) throw response;
              return response;
            },
          });
          await controller.enableMaskedPageHooks({ isEnabled: true, isBlockedByCore: false });
          assert.strictEqual(sandbox.document.getElementById("error").style.display, "block");
          assert.strictEqual(controller.getOperationState(), "failed");
        } finally {
          sandbox.restore();
        }
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 accepts one captcha retry",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/masked/example");
      try {
        preparePage(sandbox);
        const tokens = [];
        let callback;
        const destinations = [];
        const { createMaskedPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
        );
        const controller = createMaskedPageController({
          addTeardown() {},
          readThreadFlags: async () => ({ skipMaskedLink: true }),
          normalizeUrl: (value) => value,
          resolveMaskedLink: async (_url, options = {}) => {
            tokens.push(options.token || "");
            return options.token
              ? { status: "ok", msg: "https://pixeldrain.com/u/a" }
              : { status: "captcha" };
          },
          getCaptchaApi: () => ({ render: (_id, options) => { callback = options.callback; } }),
          deliverDestination: async (url) => destinations.push(url),
        });
        const operation = controller.enableMaskedPageHooks({ isEnabled: true, isBlockedByCore: false });
        for (let attempt = 0; attempt < 6 && !callback; attempt += 1) {
          await Promise.resolve();
        }
        const first = callback("token-a");
        const second = callback("token-b");
        await Promise.all([first, second, operation]);
        assert.deepStrictEqual(tokens, ["", "token-a"]);
        assert.deepStrictEqual(destinations, ["https://pixeldrain.com/u/a"]);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 aborts and suppresses late delivery on disposal",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/masked/example");
      try {
        preparePage(sandbox);
        const pending = deferredRequest();
        const destinations = [];
        const { createMaskedPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
        );
        const controller = createMaskedPageController({
          addTeardown() {},
          readThreadFlags: async () => ({ skipMaskedLink: true }),
          normalizeUrl: (value) => value,
          resolveMaskedLink: () => pending.promise,
          deliverDestination: async (url) => destinations.push(url),
        });
        const operation = controller.enableMaskedPageHooks({ isEnabled: true, isBlockedByCore: false });
        await Promise.resolve();
        controller.dispose();
        pending.resolve({ status: "ok", msg: "https://pixeldrain.com/u/a" });
        await operation;
        assert.strictEqual(pending.promise.abortCount, 1);
        assert.deepStrictEqual(destinations, []);
        assert.strictEqual(controller.getOperationState(), "disposed");
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 transport keeps canonical payloads",
    async () => {
      const sent = [];
      class FakeXhr {
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader(name, value) { (this.headers ||= {})[name] = value; }
        send(body) {
          sent.push({ method: this.method, url: this.url, body, headers: this.headers });
          this.status = 200;
          this.readyState = 4;
          this.responseText = '{"status":"ok","msg":"https://example.com"}';
          this.onreadystatechange();
        }
      }
      const { resolveMaskedLink } = loadModule(
        "addons/masked-direct-addon/src/app/contexts/maskedResolutionTransport.js",
      );
      await resolveMaskedLink("/masked/a", { XMLHttpRequestCtor: FakeXhr });
      await resolveMaskedLink("/masked/a", { token: "abc", XMLHttpRequestCtor: FakeXhr });
      assert.deepStrictEqual(sent.map((entry) => entry.body), [
        "xhr=1&download=1",
        "xhr=1&download=1&captcha=abc",
      ]);
      assert.strictEqual(sent[0].headers["X-Requested-With"], "XMLHttpRequest");

      for (const [status, responseText, expectedType] of [
        [503, "", "http"],
        [200, "not-json", "parse"],
      ]) {
        class FailingXhr extends FakeXhr {
          send() {
            this.status = status;
            this.readyState = 4;
            this.responseText = responseText;
            this.onreadystatechange();
          }
        }
        await assert.rejects(
          resolveMaskedLink("/masked/a", { XMLHttpRequestCtor: FailingXhr }),
          (error) => error.type === expectedType,
        );
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 bounds unavailable captcha readiness",
    async () => {
      const sandbox = createDomSandbox("https://f95zone.to/masked/example");
      try {
        preparePage(sandbox);
        let timestamp = 0;
        const { createMaskedPageController } = loadModule(
          "addons/masked-direct-addon/src/app/contexts/maskedPageController.js",
        );
        const controller = createMaskedPageController({
          addTeardown() {},
          readThreadFlags: async () => ({ skipMaskedLink: true }),
          normalizeUrl: (value) => value,
          resolveMaskedLink: async () => ({ status: "captcha" }),
          getCaptchaApi: () => null,
          now: () => timestamp,
          sleep: async (delay) => { timestamp += delay; },
        });
        await controller.enableMaskedPageHooks({ isEnabled: true, isBlockedByCore: false });
        assert.strictEqual(controller.getOperationState(), "failed");
        assert.match(sandbox.document.getElementById("error").textContent, /Captcha unavailable/);
      } finally {
        sandbox.restore();
      }
    },
  );

  runTest(
    "MASKED-DIRECT-MASKED-STANDALONE-RUNTIME-01 selects managed routing or bare navigation exclusively",
    async () => {
      let standalone = false;
      const managed = [];
      const bare = [];
      const { createMaskedDestinationDelivery } = loadModule(
        "addons/masked-direct-addon/src/app/maskedDestinationDelivery.js",
      );
      const deliver = createMaskedDestinationDelivery({
        getIsStandalone: () => standalone,
        routeManagedDestination: async (url) => managed.push(url),
        navigate: (url) => bare.push(url),
      });
      await deliver("https://pixeldrain.com/u/managed");
      standalone = true;
      await deliver("https://pixeldrain.com/u/bare");
      assert.deepStrictEqual(managed, ["https://pixeldrain.com/u/managed"]);
      assert.deepStrictEqual(bare, ["https://pixeldrain.com/u/bare"]);
    },
  );
};
