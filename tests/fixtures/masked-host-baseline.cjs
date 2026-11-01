"use strict";

module.exports = [
  { host: "krakenfiles", url: "https://krakenfiles.com/view/fixture/file.html", entry: "processKrakenFilesDownload", html: '<button type="submit" class="btn btn-primary">Download now</button>', timeout: 30000, grace: 3000 },
  { host: "downloadgg", url: "https://download.gg/file-fixture", entry: "processDownloadGg", html: '<button type="button" class="downloadAttachment">Download</button>', timeout: 20000, grace: 8000 },
];
