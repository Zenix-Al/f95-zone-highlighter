import { closeDialog, openDialog, updateDialog } from "../../api/ui/dialog.js";
import { registerStyle, unregisterStyle } from "../../api/ui/style.js";
import { showToast } from "../utils/showToast.js";
import { bindUpdateInbox } from "./updateInboxBindings.js";
import {
  getUpdateInboxStyleText,
  renderUpdateInbox,
} from "./updateInboxRenderer.js";

const PAGE_SIZE = 25;
const ACKNOWLEDGE_ALL_LIMIT = 200;

export function createUpdateInboxController({
  core,
  addonId,
  library,
  openEntryEditor,
  onMutated = () => {},
}) {
  const dialogId = `${addonId}-update-inbox`;
  const styleId = `${addonId}-update-inbox-style`;
  let generation = 0;
  let active = null;
  let unbind = () => {};

  function isCurrent(token) {
    return token === generation && Boolean(active);
  }

  function invalidate() {
    generation += 1;
    unbind();
    unbind = () => {};
    active = null;
  }

  async function render(token = generation) {
    if (!isCurrent(token)) return { ok: false, reason: "cancelled" };
    const result = await updateDialog(
      core,
      dialogId,
      renderUpdateInbox(active),
    );
    if (!result?.ok || !isCurrent(token)) {
      return result?.ok ? { ok: false, reason: "cancelled" } : result;
    }
    const contentId = String(result.value?.contentId || active.contentId || "");
    const root = document.getElementById(contentId);
    if (!root) return { ok: false, reason: "dialog_content_missing" };
    active.contentId = contentId;
    unbind();
    unbind = bindUpdateInbox(root, {
      edit,
      acknowledge,
      "acknowledge-all": acknowledgeAll,
      more: loadMore,
      close: () => close("user-close"),
    });
    return result;
  }

  async function enrich(records, token) {
    const entries = await Promise.all(
      records.map(async (record) => {
        const events = await library
          .listUpdateEvents(record.threadId, 1)
          .catch(() => []);
        const versionEvent = events.find((event) => event?.type === "version");
        return {
          record,
          previousVersion: String(versionEvent?.previousVersion || ""),
        };
      }),
    );
    return isCurrent(token) ? entries : [];
  }

  async function refresh({ append = false } = {}) {
    if (!active) return { ok: false, reason: "editor_closed" };
    const token = generation;
    active.loading = true;
    active.status = append ? "Loading more updates…" : "Loading updates…";
    if (!append) {
      active.entries = [];
      active.cursor = null;
      active.hasNext = false;
    }
    await render(token);
    const [page, count] = await Promise.all([
      library.queryChangedEntriesPage({
        limit: PAGE_SIZE,
        cursor: append ? active.cursor : null,
      }),
      library.countChangedEntries(),
    ]);
    if (!isCurrent(token)) return { ok: false, reason: "cancelled" };
    if (!page?.ok) {
      active.loading = false;
      active.status = `Failed to load updates (${page?.reason || "unknown"}).`;
      await render(token);
      return page;
    }
    const entries = await enrich(page.rows || [], token);
    if (!isCurrent(token)) return { ok: false, reason: "cancelled" };
    active.entries = append ? [...active.entries, ...entries] : entries;
    active.cursor = page.nextCursor || null;
    active.hasNext = Boolean(page.hasNext);
    active.count = count?.ok ? Number(count.count || 0) : null;
    active.loading = false;
    active.status = page.truncated
      ? "More updates may be available. Load the next bounded page to continue."
      : "";
    await render(token);
    return { ok: true };
  }

  async function acknowledge(threadId) {
    if (!active || active.busy) return { ok: false, reason: "busy" };
    const token = generation;
    const id = String(threadId || "").trim();
    active.busy = true;
    active.status = `Acknowledging thread ${id}…`;
    await render(token);
    const result = await library.acknowledgeCurrentUpdate(id, {
      shouldCancel: () => !isCurrent(token),
    });
    if (!isCurrent(token)) return { ok: false, reason: "cancelled" };
    active.busy = false;
    if (!result?.ok) {
      active.status =
        result?.reason === "entry_not_found"
          ? "That Library entry no longer exists."
          : `Acknowledgement failed (${result?.reason || "unknown"}).`;
      await render(token);
      return result;
    }
    await refresh();
    await onMutated(result);
    return result;
  }

  async function collectChangedIds(token) {
    const ids = [];
    let cursor = null;
    let hasNext = true;
    while (hasNext && ids.length < ACKNOWLEDGE_ALL_LIMIT && isCurrent(token)) {
      const page = await library.queryChangedEntriesPage({
        limit: Math.min(100, ACKNOWLEDGE_ALL_LIMIT - ids.length),
        cursor,
      });
      if (!page?.ok) return { ok: false, reason: page?.reason || "query_failed" };
      ids.push(...page.rows.map((record) => record.threadId));
      cursor = page.nextCursor || null;
      hasNext = Boolean(page.hasNext && cursor);
    }
    return { ok: true, ids: [...new Set(ids)], truncated: hasNext };
  }

  async function acknowledgeAll() {
    if (!active || active.busy) return { ok: false, reason: "busy" };
    const token = generation;
    active.busy = true;
    active.status = "Collecting current unacknowledged updates…";
    await render(token);
    const collected = await collectChangedIds(token);
    if (!isCurrent(token)) return { ok: false, reason: "cancelled" };
    if (!collected.ok) {
      active.busy = false;
      active.status = `Could not collect updates (${collected.reason}).`;
      await render(token);
      return collected;
    }
    const result = await library.acknowledgeChangedEntries(collected.ids, {
      limit: ACKNOWLEDGE_ALL_LIMIT,
      shouldCancel: () => !isCurrent(token),
    });
    if (!isCurrent(token)) return { ok: false, reason: "cancelled" };
    active.busy = false;
    active.status = `Acknowledge all: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed${collected.truncated ? "; more remain" : ""}.`;
    await refresh();
    if (active) active.status = `Acknowledge all: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed${collected.truncated ? "; more remain" : ""}.`;
    await render(token);
    await onMutated(result);
    if (result.failed) {
      await showToast("Some Library updates could not be acknowledged.", "error");
    }
    return result;
  }

  async function edit(threadId) {
    if (!active || active.busy) return { ok: false, reason: "busy" };
    const id = String(threadId || "").trim();
    const token = generation;
    active.busy = true;
    await render(token);
    await close("edit-entry");
    const fresh = await library.getEntryFresh(id);
    if (!fresh) {
      await showToast("Library entry no longer exists.", "error");
      return { ok: false, reason: "entry_not_found" };
    }
    const result = await openEntryEditor(id);
    if (!result?.ok) {
      await showToast(`Unable to edit Library entry (${result?.reason || "unknown"}).`, "error");
    }
    return result;
  }

  async function loadMore() {
    if (!active || active.busy || !active.hasNext) {
      return { ok: false, reason: "not_available" };
    }
    return refresh({ append: true });
  }

  async function open() {
    if (active) return { ok: true, value: { alreadyOpen: true } };
    const token = ++generation;
    unbind();
    unbind = () => {};
    active = {
      entries: [],
      cursor: null,
      hasNext: false,
      count: null,
      loading: true,
      busy: false,
      status: "Loading updates…",
      contentId: "",
    };
    const styled = await registerStyle(core, styleId, getUpdateInboxStyleText());
    if (!styled?.ok) {
      if (isCurrent(token)) invalidate();
      return styled;
    }
    if (!isCurrent(token)) {
      await unregisterStyle(core, styleId);
      return { ok: false, reason: "cancelled" };
    }
    const result = await openDialog(core, {
      dialogId,
      title: "Library Updates",
      html: renderUpdateInbox(active),
      size: "lg",
      closeOnEsc: true,
      closeOnBackdrop: true,
    });
    if (!result?.ok || !isCurrent(token)) {
      await unregisterStyle(core, styleId);
      return result?.ok ? { ok: false, reason: "cancelled" } : result;
    }
    active.contentId = String(result.value?.contentId || "");
    const root = document.getElementById(active.contentId);
    if (!root) {
      await close("content-missing");
      return { ok: false, reason: "dialog_content_missing" };
    }
    unbind = bindUpdateInbox(root, {
      edit,
      acknowledge,
      "acknowledge-all": acknowledgeAll,
      more: loadMore,
      close: () => close("user-close"),
    });
    await refresh();
    return result;
  }

  async function close(reason = "addon-close") {
    const wasActive = Boolean(active);
    invalidate();
    const result = wasActive
      ? await closeDialog(core, dialogId, reason)
      : { ok: true, value: { alreadyClosed: true } };
    await unregisterStyle(core, styleId);
    return result;
  }

  async function handleDialogClosed(detail = {}) {
    if (String(detail.dialogId || "") !== dialogId) return false;
    invalidate();
    await unregisterStyle(core, styleId);
    return true;
  }

  return {
    open,
    close,
    handleDialogClosed,
    getSnapshot: () => ({
      dialogId,
      active: Boolean(active),
      generation,
      count: active?.count ?? null,
      entries: active?.entries.length || 0,
      busy: Boolean(active?.busy),
    }),
  };
}
