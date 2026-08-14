export function resolveMaskedLink(url, { token = "", XMLHttpRequestCtor = XMLHttpRequest } = {}) {
  let xhr = null;
  const promise = new Promise((resolve, reject) => {
    xhr = new XMLHttpRequestCtor();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200) {
        reject({ type: "http", status: xhr.status });
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (error) {
        reject({ type: "parse", error });
      }
    };
    xhr.send(`xhr=1&download=1${token ? `&captcha=${token}` : ""}`);
  });
  promise.abort = () => xhr?.abort?.();
  return promise;
}
