/**
 * Creates and sends an XHR request to resolve a masked link.
 * @param {string} url The full URL to POST to.
 * @param {object} [options]
 * @param {string} [options.token] An optional captcha token.
 * @returns {Promise<object>} A promise that resolves with the parsed JSON response or rejects with an error object.
 */
export function resolveMaskedLink(url, { token = "" } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest"); // Needed for background resolving

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject({ type: "parse", error: e });
        }
      } else {
        reject({ type: "http", status: xhr.status });
      }
    };

    xhr.send(`xhr=1&download=1${token ? `&captcha=${token}` : ""}`);
  });
}
