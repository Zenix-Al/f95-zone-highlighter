"use strict";

module.exports = ({ assert, fs, path, ROOT, loadModule, runTest }) => {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/library-latest-api-chilling-ridge.json"), "utf8"));
  const row = fixture.msg.data[0];
  const { selectLatestListing } = loadModule("addons/library-addon/src/library/latestListingSelector.js");
  const response = (data, total = data.length) => ({ status: "ok", msg: { data, pagination: { page: 1, total } } });

  runTest("LIBRARY-HYBRID-03 selects the supplied listing by numeric or string ID without mutation", () => {
    const before = JSON.stringify(fixture);
    for (const id of [281676, "281676"]) {
      assert.strictEqual(selectLatestListing(fixture, id).value, row);
      assert.strictEqual(selectLatestListing(response([{ ...row, thread_id: "281676" }]), id).ok, true);
    }
    assert.strictEqual(JSON.stringify(fixture), before);
  });

  runTest("LIBRARY-HYBRID-03 scans every position in one to fifteen rows and accepts renamed titles", () => {
    for (let length = 1; length <= 15; length += 1) {
      for (let position = 0; position < length; position += 1) {
        const rows = Array.from({ length }, (_, index) => ({ ...row, thread_id: index + 1 }));
        rows[position] = { ...row, title: "A completely renamed game" };
        assert.strictEqual(selectLatestListing(response(rows, 900), row.thread_id).value, rows[position]);
      }
    }
  });

  runTest("LIBRARY-HYBRID-03 identical titles never substitute for identity and misses do not crawl", () => {
    assert.strictEqual(selectLatestListing(response([{ ...row, thread_id: 42 }]), row.thread_id).reason, "id_not_found");
    assert.strictEqual(selectLatestListing(response([], 900), row.thread_id).reason, "id_not_found");
    const { createLatestSearchUrl, selectUpdateSource } = loadModule("addons/library-addon/src/library/updateSource.js");
    const url = new URL(createLatestSearchUrl("  Game  [Legitimate subtitle] & More  "));
    assert.strictEqual(url.searchParams.get("search"), "Game Legitimate subtitle More");
    assert.strictEqual(url.searchParams.get("page"), "1");
    assert.strictEqual(url.searchParams.get("rows"), "15");
    assert.strictEqual(selectUpdateSource({ preferLatestApi: true }).source, "hybrid");
  });

  runTest("LIBRARY-HYBRID-SEARCH-01 bounds cleaned title/creator without splitting words or changing identity", () => {
    const { createLatestSearchUrl, sanitizeLatestQuery, sanitizeLatestCreatorQuery } = loadModule("addons/library-addon/src/library/updateSource.js");
    const raw = "Net Girlfriend! ~A Sweet Cohabitation Life with My Shut-In Girlfriend~ [Final]";
    const url = new URL(createLatestSearchUrl(raw, "Hypersomnia Butterfly", { version: "Final", now: () => 123 }));
    assert.strictEqual(url.searchParams.get("search"), "Net Girlfriend Sweet");
    assert.strictEqual(url.searchParams.get("creator"), "Hypersomnia Butterfly");
    assert.strictEqual(url.searchParams.get("_"), "123");
    assert.ok(url.href.includes("Net%20Girlfriend%20Sweet"));
    assert.strictEqual(sanitizeLatestCreatorQuery("Savin/Salamander Studios"), "Salamander Studios");
    assert.strictEqual(sanitizeLatestCreatorQuery("pu-re ga-me"), "re ga");
    assert.strictEqual(sanitizeLatestCreatorQuery("Under_Formatman"), "Under_Formatman");
    assert.strictEqual(sanitizeLatestCreatorQuery("HP⁺ DOG"), "DOG");
    for (const separator of ["+", ":", "&", "!", "@", "#", "%", "=", "ü", "⁺", "/", "\\", "-", "*"]) {
      assert.strictEqual(sanitizeLatestCreatorQuery(`HP${separator} DOG`), "DOG", `creator separator ${separator}`);
    }
    assert.strictEqual(sanitizeLatestCreatorQuery("_Studio_78"), "_Studio_78");
    assert.strictEqual(sanitizeLatestCreatorQuery("78Games Studio"), "78Games Studio");
    assert.strictEqual(new URL(createLatestSearchUrl("Last Breath", "HP⁺ DOG")).searchParams.get("creator"), "DOG");
    assert.strictEqual(sanitizeLatestCreatorQuery("DKT-DOKATA"), "DOKATA");
    assert.strictEqual(sanitizeLatestCreatorQuery("Ramen Cat Studio/Shu Ha Ji"), "Ramen Cat Studio");
    assert.strictEqual(sanitizeLatestCreatorQuery("M-Gentlemen After-party"), "Gentlemen After");
    assert.strictEqual(sanitizeLatestCreatorQuery("cat/dog"), "cat");
    assert.strictEqual(sanitizeLatestQuery("Zombie's Retreat 2: Gridlocked"), "Zombie Retreat 2 Gridlocked");
    assert.strictEqual(sanitizeLatestQuery("Loser Got Isekai’d – Sex, Side Jobs, and Odd Tasks"), "Loser Got Isekai Sex Side Jobs");
    assert.strictEqual(sanitizeLatestQuery("X 2 78 500 Games"), "2 78 500 Games");
    assert.strictEqual(sanitizeLatestCreatorQuery("X 2 Studio 78"), "2 Studio 78");
    assert.strictEqual(sanitizeLatestQuery("Game with Friends"), "Game Friends");
    assert.strictEqual(sanitizeLatestQuery("She Was a Woman Not Just an Auntie"), "She Woman Just Auntie");
    assert.strictEqual(sanitizeLatestCreatorQuery("An Artist Was Not Alone"), "Artist Alone");
    assert.strictEqual(sanitizeLatestQuery("Another Notable Swan"), "Another Notable Swan");
    assert.strictEqual(sanitizeLatestQuery("There Is Treasure THERE"), "Treasure");
    assert.strictEqual(sanitizeLatestCreatorQuery("There Studio"), "Studio");
    assert.strictEqual(sanitizeLatestQuery("Therefore Wherever"), "Therefore Wherever");
    assert.strictEqual(sanitizeLatestQuery("THIS Island IS Built BY Robots"), "Island Built Robots");
    assert.strictEqual(sanitizeLatestCreatorQuery("This Studio Is By Artists"), "Studio Artists");
    assert.strictEqual(sanitizeLatestQuery("Island Abyss Thistle"), "Island Abyss Thistle");
    assert.strictEqual(sanitizeLatestQuery("Corruption of champion"), "Corruption champion");
    assert.strictEqual(sanitizeLatestQuery("No Haven"), "Haven");
    assert.strictEqual(sanitizeLatestQuery("IN the Princess Inn"), "Princess Inn");
    assert.strictEqual(sanitizeLatestQuery("Me and Succubus"), "Me Succubus");
    assert.strictEqual(sanitizeLatestQuery("Welcome to Erosland"), "Welcome Erosland");
    assert.strictEqual(sanitizeLatestQuery("Yoü Studio"), "Yo Studio");
    assert.strictEqual(sanitizeLatestQuery("üStudio Studioü"), "Studio Studio");
    assert.strictEqual(sanitizeLatestQuery("abcülonger"), "abc longer");
    assert.strictEqual(sanitizeLatestQuery("short* longword"), "short longword");
    assert.strictEqual(sanitizeLatestQuery("short *longword"), "short longword");
    assert.strictEqual(sanitizeLatestQuery("Honey Select 2 AND Tokyo"), "Honey Select 2 Tokyo");
    assert.strictEqual(sanitizeLatestQuery("Candy Tomorrow Into"), "Candy Tomorrow Into");
    assert.strictEqual(new URL(createLatestSearchUrl("Game in Space", "Studio IN Town")).searchParams.get("creator"), "Studio Town");
    assert.strictEqual(sanitizeLatestQuery("Lilith's Throne"), "Lilith Throne");
    assert.strictEqual(sanitizeLatestQuery("cat/dog"), "cat dog", "equal sides are retained");
    assert.strictEqual(sanitizeLatestQuery("onion theatre officer nobody"), "onion theatre officer nobody");
    assert.strictEqual(sanitizeLatestQuery("123456789012345678901234567 of the a on no"), "123456789012345678901234567");
    assert.strictEqual(sanitizeLatestQuery("1234567890123456789012345678901"), "");
    assert.strictEqual(createLatestSearchUrl("the of no on a"), "");
    assert.strictEqual(createLatestSearchUrl("a b", "X Y"), "");
    assert.strictEqual(new URL(createLatestSearchUrl("2", "3")).searchParams.get("search"), "2");
    assert.strictEqual(new URL(createLatestSearchUrl("2", "3")).searchParams.get("creator"), "3");
    const creatorOnly = new URL(createLatestSearchUrl("a b", "Studio"));
    assert.strictEqual(creatorOnly.searchParams.has("search"), false);
    assert.strictEqual(creatorOnly.searchParams.get("creator"), "Studio");
    assert.strictEqual(new URL(createLatestSearchUrl("Game", "X Y")).searchParams.has("creator"), false);
    const missingCreator = new URL(createLatestSearchUrl("Game", "the / of"));
    assert.strictEqual(missingCreator.searchParams.has("creator"), false);
    const { getLatestSearchTitle } = loadModule("addons/library-addon/src/library/updateSource.js");
    assert.strictEqual(getLatestSearchTitle("Game [Final]", "Final"), "Game");
    assert.strictEqual(getLatestSearchTitle("Game [Subtitle]", "v1"), "Game [Subtitle]");
    for (const value of [raw, "a of on " + raw, "Savin/Salamander Studios", "A B C D E F G H I J K L M N O P Q R"]) {
      const cleaned = sanitizeLatestQuery(value);
      assert.ok(cleaned.length <= 30);
      assert.doesNotMatch(cleaned, /\b(?:a|an|the|there|this|is|by|of|no|not|on|in|and|to|with|was)\b/i);
      assert.match(cleaned, /^[a-z0-9 ]*$/i);
    }
  });

  runTest("LIBRARY-HYBRID-VERSION-01 accepts numeric versions including zero without mutating listings", () => {
    const { mapLatestListingFacts } = loadModule("addons/library-addon/src/library/latestListingFacts.js");
    for (const version of [0.06, 0, 1, "0.06", "0", "Final"]) {
      const listing = { thread_id: 293410, title: "Supremacy", version };
      const selected = selectLatestListing(response([listing]), "293410");
      assert.strictEqual(selected.ok, true);
      assert.strictEqual(selected.value.version, String(version));
      assert.strictEqual(listing.version, version);
      const facts = mapLatestListingFacts(selected.value, { thread: { url: "https://f95zone.to/threads/293410/" } }, null);
      assert.strictEqual(facts.value.currentVersion, String(version));
    }
    for (const version of [null, undefined, true, false, {}, [], "", "   ", NaN, Infinity, -Infinity, "x".repeat(161)]) {
      assert.strictEqual(selectLatestListing(response([{ ...row, version }]), row.thread_id).ok, false);
    }
  });

  runTest("LIBRARY-HYBRID-03 deduplicates identical facts but rejects conflicting same-ID rows", () => {
    const reordered = Object.fromEntries(Object.entries(row).reverse());
    reordered.thread_id = String(row.thread_id);
    assert.strictEqual(selectLatestListing(response([row, reordered]), row.thread_id).value, row);
    for (const patch of [{ title: "Different" }, { version: "v9" }, { rating: 0 }, { tags: [] }]) {
      assert.strictEqual(selectLatestListing(response([row, { ...row, ...patch }]), row.thread_id).reason, "conflicting_matches");
    }
  });

  runTest("LIBRARY-HYBRID-03 rejects malformed oversized and unsafe identities with bounded fallback", () => {
    for (const payload of [null, {}, { status: "error", msg: fixture.msg }, response({}), response(Array(16).fill(row)), response([null]), response([{ ...row, thread_id: 0 }]), response([{ ...row, thread_id: Number.MAX_SAFE_INTEGER + 1 }]), { ...fixture, msg: { ...fixture.msg, pagination: { page: 2 } } }]) {
      assert.strictEqual(selectLatestListing(payload, row.thread_id).reason, "invalid_response");
    }
    for (const id of [0, -1, "01", "1e3", {}, Number.MAX_SAFE_INTEGER + 1]) {
      assert.strictEqual(selectLatestListing(fixture, id).reason, "invalid_thread_id");
    }
    for (const patch of [{ title: "" }, { version: null }, { title: "x".repeat(1001) }]) {
      assert.strictEqual(selectLatestListing(response([{ ...row, ...patch }]), row.thread_id).reason, "missing_facts");
    }
    assert.strictEqual(selectLatestListing(response([{ ...row, screens: Array(257).fill("x") }]), row.thread_id).reason, "invalid_response");
  });
};
