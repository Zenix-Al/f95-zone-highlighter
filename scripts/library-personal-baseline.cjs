"use strict";

const fs = require("fs");
const path = require("path");
const { createBaseline, stableJson } = require("./addon-baseline.cjs");
const {
  createFixtures,
  createRecords,
} = require("../tests/fixtures/libraryPersonalBaselineFixtures.cjs");

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

function extractQuotedValues(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

function characterizeSource() {
  const constants = read("addons/library-addon/src/constants.js");
  const managerHtml = read("addons/library-addon/src/ui/assets/manager.html");
  const renderer = read(
    "addons/library-addon/src/ui/components/manager/tableRenderer.js",
  );
  const managerApp = read("addons/library-addon/src/ui/manager/managerApp.js");
  const importExport = read(
    "addons/library-addon/src/ui/application/importExportWorkflow.js",
  );
  const rowHandlers = read(
    "addons/library-addon/src/ui/manager/handlers/rowHandlers.js",
  );
  const querying = read("addons/library-addon/src/library/querying.js");

  const headings = extractQuotedValues(
    managerHtml,
    /<th(?:\s[^>]*)?>([^<]*)<\/th>/g,
  ).map((value) => value.trim());
  const actions = [
    ...new Set(
      extractQuotedValues(
        `${managerHtml}\n${renderer}`,
        /data-action="([^"]+)"/g,
      ),
    ),
  ].sort();

  return {
    database: {
      logicalName: "library",
      physicalName: "f95ue-addon:library-addon:library",
      version: 1,
      stores: [
        {
          name: "records",
          keyPath: "threadId",
          indexes: [
            { name: "updatedAt", keyPath: "updatedAt" },
            { name: "userStatus", keyPath: "userStatus" },
            { name: "titleNormalized", keyPath: "titleNormalized" },
            { name: "prefix", keyPath: "prefix" },
            { name: "tags", keyPath: "tags", multiEntry: true },
          ],
        },
      ],
      evidence: {
        dbName: /LIBRARY_DB_NAME\s*=\s*"library"/.test(constants),
        storeName: /LIBRARY_STORE_NAME\s*=\s*"records"/.test(constants),
      },
    },
    recordShape: Object.keys(createFixtures().version3),
    behavior: {
      tableHeadings: headings,
      rowActions: actions,
      displayedRating:
        renderer.includes("entry.personal?.rating")
        ? "personal.rating"
        : "unknown",
      personalRatingField: "personal.rating",
      personalRatingRendered: /entry\.personal\?\.rating/.test(renderer),
      noteEditing: {
        inline: renderer.includes('data-action="note-input"'),
        doneAction: renderer.includes('data-action="note-done"'),
      },
      managerReopen: {
        stableDialogId: managerApp.includes('}-manager`'),
        generationGuard: managerApp.includes("generation"),
        closeResetsRoot: managerApp.includes("appContext.dialogRoot = null"),
      },
      importExport: {
        acceptsArray: importExport.includes("Array.isArray(parsed)"),
        acceptsRecordsDocument: importExport.includes(
          "Array.isArray(parsed?.records)",
        ),
        exportsRecords: importExport.includes("records:"),
      },
      threadUpdateFields: [
        "url",
        "title",
        "canonicalTitle",
        "titleNormalized",
        "prefix",
        "gameVersion",
        "prefixes",
        "developer",
        "threadRating",
        "tags",
        "sourcePage",
      ].filter((field) => rowHandlers.includes(`${field}:`)),
      sortIndexes: extractQuotedValues(
        querying,
        /^\s*([A-Za-z][A-Za-z0-9]*):\s*"[^"]+"/gm,
      ).sort(),
      filtersByStatus:
        querying.includes("record?.userStatus") ||
        querying.includes("record?.personal?.status"),
    },
  };
}

async function createLibraryPersonalBaseline() {
  const addonReport = await createBaseline();
  const library = addonReport.addons.find(
    (entry) => entry.id === "library-addon",
  );
  if (!library) throw new Error("library_addon_missing");

  const fixtures = createFixtures();
  const measurements = [10, 1000, 10000].map((count) => {
    const records = createRecords(count);
    return {
      count,
      serializedBytes: bytes(records),
      averageRecordBytes: Math.round(bytes(records) / count),
    };
  });

  return {
    reportSchemaVersion: 1,
    tool: "library-personal-baseline",
    scope: "LIBRARY-PERSONAL-BASELINE-01",
    productionMutation: false,
    source: characterizeSource(),
    fixtures: Object.fromEntries(
      Object.entries(fixtures).map(([name, value]) => [
        name,
        { fields: Object.keys(value).sort(), serializedBytes: bytes(value) },
      ]),
    ),
    scaleMeasurements: measurements,
    build: {
      authoredBytes: library.source.authoredBytes,
      fileCount: library.source.fileCount,
      regular: library.builds.regular,
      release: library.builds.release,
    },
    deterministic: {
      timestamps: false,
      absolutePaths: false,
      network: false,
      indexedDbOpened: false,
    },
  };
}

async function main(args = process.argv.slice(2)) {
  const outputIndex = args.indexOf("--output");
  const checkIndex = args.indexOf("--check");
  const report = await createLibraryPersonalBaseline();
  const serialized = stableJson(report);
  if (outputIndex >= 0) {
    const output = path.resolve(ROOT, args[outputIndex + 1]);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized);
    console.log(`Wrote ${path.relative(ROOT, output).replaceAll("\\", "/")}.`);
  } else if (checkIndex >= 0) {
    const expected = fs.readFileSync(
      path.resolve(ROOT, args[checkIndex + 1]),
      "utf8",
    );
    if (expected !== serialized) throw new Error("Library baseline differs.");
    console.log("Library personal baseline check passed.");
  } else {
    process.stdout.write(serialized);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Library personal baseline failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { characterizeSource, createLibraryPersonalBaseline };
