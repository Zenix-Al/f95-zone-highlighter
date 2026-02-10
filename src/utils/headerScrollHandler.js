/**
 * Creates a reusable scroll handler to hide/show an element (usually the header)
 * based on scroll direction and position.
 * @param {object} options
 * @param {number} options.threshold - The scrollY position after which the hiding effect can start.
 * @param {string} options.hiddenClassName - The CSS class to toggle on the root element.
 * @returns {{enable: function, disable: function}} - An object with enable and disable methods.
 */
function createHeaderScrollHandler({ threshold, hiddenClassName }) {
  let scrollHandler = null;
  let lastScrollY = 0;

  const handler = () => {
    const root = document.documentElement;
    const currentY = window.scrollY;

    if (currentY > lastScrollY && currentY > threshold) {
      root.classList.add(hiddenClassName);
    } else {
      root.classList.remove(hiddenClassName);
    }

    lastScrollY = currentY;
  };

  function enable() {
    if (scrollHandler) return;
    lastScrollY = window.scrollY;
    scrollHandler = handler;
    window.addEventListener("scroll", scrollHandler, { passive: true });
  }

  function disable() {
    if (!scrollHandler) return;
    window.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
    document.documentElement.classList.remove(hiddenClassName);
  }

  return { enable, disable };
}

export const latestPageScroll = createHeaderScrollHandler({
  threshold: 80,
  hiddenClassName: "header-hidden",
});

export const threadPageScroll = createHeaderScrollHandler({
  threshold: 120,
  hiddenClassName: "thread-header-hidden",
});
