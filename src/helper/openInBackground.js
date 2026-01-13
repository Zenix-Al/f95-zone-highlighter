export function tryOpenInBackground(url) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer"; // security + helps prevent focus steal
  a.style.display = "none"; // hide it completely
  document.body.appendChild(a);

  a.click(); // simulates real click

  // Clean up right away
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
}
