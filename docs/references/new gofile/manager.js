import { $, escapeHtml, formatBytes, formatCount, formatDateTime, icon, isCoarsePointer, modHint, prefersReducedMotion, refreshIcons } from '../core/dom.js';
import { navigate } from '../core/navigation.js';
import { layerCount } from '../core/layers.js';
import { store, getActiveAccount } from '../accounts/accountStore.js';
import { accountsReady, initAccounts, refreshActiveAccount } from '../accounts/accountService.js';
import { ApiError } from '../services/api.js';
import * as contents from '../services/contents.js';
import { sha256Hex } from '../core/sha256.js';
import { toast } from '../ui/toast.js';
import { popup } from '../ui/popup.js';
import { showPremiumUpsell } from '../ui/premiumUpsell.js';
import { openMenu, openContextMenu } from '../ui/menu.js';
import { attachBackToTop } from '../ui/backtotop.js';
import { folderCapabilities, itemCapabilities } from './capabilities.js';
import { isPreviewable, previewableItems } from './icons.js';
import { readListingCache, writeListingCache, invalidateListingCache } from './listingCache.js';
import {
  THUMBNAIL_SIZES,
  getShowThumbnails,
  setShowThumbnails,
  getThumbnailSize,
  setThumbnailSize as persistThumbnailSize,
} from './displayPrefs.js';
import { rememberParents, knownParentOf } from './parentMap.js';
import { patchMeta, markPrerenderReady } from '../core/meta.js';
import { maybeShowAds } from '../core/adsOptional.js';
import { openMediaPreview, mountInlinePreview } from './preview.js';
import { openSharePopup, openAccessPopup, openDescriptionEditor, openTagsEditor, openDirectLinksManager } from './settings.js';
import { openReportPopup } from './report.js';
import { enqueueUpload, filesFromDrop, onUploadEvent } from '../uploads/uploadService.js';
import {
  skeletonTemplate,
  gateTemplate,
  errorTemplate,
  managerTemplate,
  toolbarTemplate,
  filterBarTemplate,
  noticesTemplate,
  itemsListTemplate,
  selectCheckboxHtml,
  fileViewTemplate,
  filePreviewButtonHtml,
  DESCRIPTION_CLAMP_CLASSES,
} from './templates.js';

// notFound carries a real 404 status for bots.
const GATE_META = {
  notFound: {
    title: 'Content not found',
    description: 'The requested content does not exist or has been deleted.',
    prerenderStatus: 404,
  },
  notPublic: {
    title: 'Protected content',
    description: 'This content is not publicly accessible.',
  },
  expired: {
    title: 'Content expired',
    description: 'This shared content has expired.',
  },
  password: {
    title: 'Protected content',
    description: 'This content is password protected.',
  },
};

const SORT_STORAGE_KEY = 'gofile.files.sort';
const LEGACY_SORT_FIELD_KEY = 'fileManagerSortField';
const LEGACY_SORT_DIRECTION_KEY = 'fileManagerSortDirection';
const CLIPBOARD_STORAGE_KEY = 'gofile.files.clipboard';

// Thumbnail display prefs (keys, defaults, validation) live in
// files/displayPrefs.js — shared with My Profile -> Preferences.

const PAGE_SIZE = 100;
const LONG_PRESS_MS = 450;

/* The listing cache lives in files/listingCache.js (shared with the     */
/* upload service — see that module for the mutation-invalidation rule). */

function loadSort() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY));
    if (parsed && contents.SORT_FIELDS.includes(parsed.field) && (parsed.direction === 1 || parsed.direction === -1)) {
      return parsed;
    }
  } catch { /* corrupted -> legacy adoption below */ }

  // One-time adoption of the legacy frontend's sort preference (same field
  // names, same 1/-1 direction semantics).
  try {
    const legacyField = localStorage.getItem(LEGACY_SORT_FIELD_KEY);
    const legacyDirection = localStorage.getItem(LEGACY_SORT_DIRECTION_KEY);
    if (legacyField !== null) localStorage.removeItem(LEGACY_SORT_FIELD_KEY);
    if (legacyDirection !== null) localStorage.removeItem(LEGACY_SORT_DIRECTION_KEY);
    const direction = Number(legacyDirection);
    if (contents.SORT_FIELDS.includes(legacyField) && (direction === 1 || direction === -1)) {
      const sort = { field: legacyField, direction };
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
      return sort;
    }
  } catch { /* storage blocked -> default */ }
  return { field: 'createTime', direction: -1 };
}

function loadClipboard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLIPBOARD_STORAGE_KEY));
    if (
      parsed &&
      (parsed.op === 'copy' || parsed.op === 'move') &&
      Array.isArray(parsed.ids) && parsed.ids.length > 0 &&
      typeof parsed.accountId === 'string'
    ) {
      return parsed;
    }
  } catch { /* corrupted -> none */ }
  return null;
}

export class FileManager {
  constructor({ root, params }) {
    this.root = root;
    this.params = params;
    this.destroyed = false;

    const query = new URLSearchParams(location.search);
    const page = Number.parseInt(query.get('page'), 10);

    this.state = {
      status: 'loading',
      gate: null,
      error: null,
      account: null,
      folderId: null,
      folder: null, // folder payload — or the file payload on single-file views
      fileView: false,
      // Single-file view: the inline preview card starts open; the Preview
      // button toggles it (no popup there).
      filePreviewOpen: true,
      metadata: null,
      items: [],
      itemCaps: new Map(),
      selection: new Set(),
      sort: loadSort(),
      filter: query.get('filter') ?? '',
      filterOpen: Boolean(query.get('filter')),
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize: PAGE_SIZE,
      showThumbnails: getShowThumbnails(),
      thumbnailSize: getThumbnailSize(),
      clipboard: loadClipboard(),
      descriptionExpanded: false,
      // Owned by the active account — drives the page title, account-switch
      // re-targeting and the sidebar highlight (app:files-context).
      ownerView: false,
      // A SOFT reload is in flight: the list stays on screen (dimmed) instead
      // of flashing the skeleton.
      softLoading: false,
    };

    this.loadedAccountId = null;
    this.loadSeq = 0; // stale-response guard
    this.pending = false; // a mutation request is in flight (re-entrancy guard)
    this.longPress = null;
    this.selectionAnchor = null; // shift-click range origin
    this.suppressClickOnce = false; // swallow the click trailing a long-press
    this.dragDepth = 0;
    this.unsubscribeActive = null;
    this.unsubscribeUploads = null;
    this.backToTop = null;
    this.descResizeTimer = null;
  }

  mount() {
    this.render();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('submit', this.onSubmit);
    this.root.addEventListener('contextmenu', this.onContextMenu);
    this.root.addEventListener('pointerdown', this.onPointerDown);
    // Window-level so the shortcuts work wherever focus sits; released in destroy().
    window.addEventListener('keydown', this.onKeyDown);
    // Window-level so a drop lands anywhere on the page — an empty folder
    // leaves most of it outside #fm-root. Released in destroy().
    window.addEventListener('dragenter', this.onDragEnter);
    window.addEventListener('dragover', this.onDragOver);
    window.addEventListener('dragleave', this.onDragLeave);
    window.addEventListener('drop', this.onDrop);

    // Owned content re-targets to the new account's root; foreign content
    // just reloads with the new token.
    this.unsubscribeActive = store.subscribe('activeId', (id) => {
      if (this.destroyed || !this.loadedAccountId || id === this.loadedAccountId) return;
      const rootFolder = getActiveAccount()?.rootFolder;
      if (this.state.ownerView && rootFolder) {
        this.params = { contentId: rootFolder };
        history.replaceState({}, '', `/d/${rootFolder}`);
      }
      this.load({ force: true });
    });

    // Body-appended so it survives re-renders; a 100-item page can be tens
    // of thousands of pixels tall.
    this.backToTop = attachBackToTop();

    // A resize rewraps the description and can push it across the clamp
    // threshold without a re-render — re-measure (debounced). A ResizeObserver
    // on the body would loop (syncDescription itself mutates the clamp
    // classes); window resize covers the only no-rerender case.
    this.onWindowResize = () => {
      clearTimeout(this.descResizeTimer);
      this.descResizeTimer = setTimeout(() => {
        if (!this.destroyed) this.syncDescription();
      }, 150);
    };
    window.addEventListener('resize', this.onWindowResize);

    this.load();

    // Uploads run in the global service (they survive navigation) — only
    // react while the manager is still viewing the destination folder.
    this.unsubscribeUploads = onUploadEvent('completed', (job) => {
      if (this.destroyed || job.kind !== 'manager' || job.doneCount === 0) return;
      if (job.folderId !== this.state.folderId) return;
      this.reload();
    });
  }

  destroy() {
    this.destroyed = true;
    this.pauseFilePreview();
    this.unsubscribeActive?.();
    this.unsubscribeUploads?.();
    this.cancelLongPress();
    this.backToTop?.destroy();
    this.backToTop = null;
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('dragenter', this.onDragEnter);
    window.removeEventListener('dragover', this.onDragOver);
    window.removeEventListener('dragleave', this.onDragLeave);
    window.removeEventListener('drop', this.onDrop);
    clearTimeout(this.descResizeTimer);
  }

  /** Folders link by code when public; files link by code when they have one; uuid otherwise. */
  urlIdFor(content) {
    if (content?.type === 'file') return content?.code ?? content?.id;
    return content?.public === true && content?.code ? content.code : content?.id;
  }

  hrefFor(content) {
    return `/d/${this.urlIdFor(content)}`;
  }

  async load({ force = false, soft = false } = {}) {
    const seq = ++this.loadSeq;
    // A soft reload (toolbar refresh, mutation follow-ups) keeps the current
    // list on screen — dimmed and inert — instead of flashing the skeleton.
    const keepView = soft && this.state.status === 'ready' && !this.state.fileView;
    this.state.softLoading = keepView;
    if (keepView) {
      this.state.selection.clear();
      this.selectionAnchor = null;
      this.renderToolbar();
      const list = $('#fm-list', this.root);
      if (list) {
        list.classList.add('opacity-50', 'pointer-events-none');
        list.setAttribute('aria-busy', 'true');
      }
    } else {
      this.state.status = 'loading';
      this.state.selection.clear();
      this.selectionAnchor = null;
      this.state.descriptionExpanded = false;
      this.render();
    }

    await accountsReady;
    const account = getActiveAccount();
    if (this.destroyed || seq !== this.loadSeq) return;

    if (!account) {
      this.state.softLoading = false;
      this.state.status = 'error';
      this.state.error = { kind: 'noAccount' };
      this.render();
      return;
    }
    this.state.account = account;
    this.loadedAccountId = account.id;

    const id = this.params.contentId;
    if (!id) {
      this.state.softLoading = false;
      this.state.status = 'error';
      this.state.error = { kind: 'transient' };
      this.render();
      return;
    }

    const password = sessionStorage.getItem(`password|${id}`) ?? undefined;
    const query = {
      filter: this.state.filter || undefined,
      page: this.state.page,
      pageSize: this.state.pageSize,
      sortField: this.state.sort.field,
      sortDirection: this.state.sort.direction,
      password,
    };
    const cacheKey = [account.token, id, JSON.stringify(query)].join('|');

    let result = force ? null : readListingCache(cacheKey);
    if (!result) {
      try {
        result = await contents.getFolder(account.token, id, query);
        writeListingCache(cacheKey, result);
      } catch (error) {
        if (this.destroyed || seq !== this.loadSeq) return;
        await this.handleLoadError(error);
        return;
      }
    }
    if (this.destroyed || seq !== this.loadSeq) return;
    this.state.softLoading = false;

    const { data, metadata } = result;

    // The uuid is the ONLY id the mutation endpoints accept (the listing
    // also resolves share codes) — the working id from here on.
    this.state.folderId = data.id ?? id;

    // Gates arrive as 200s with canAccess === false — file gates included,
    // inherited from the parent folder (the password key works for file uuids too).
    if (data.canAccess === false) {
      if (data.password === true) {
        if (data.passwordStatus === 'passwordWrong') sessionStorage.removeItem(`password|${id}`);
        this.state.gate = { kind: 'password', passwordWrong: data.passwordStatus === 'passwordWrong' };
      } else if (data.public === false) {
        this.state.gate = { kind: 'notPublic' };
      } else if (data.expire) {
        this.state.gate = { kind: 'expired' };
      } else {
        this.state.gate = { kind: 'notPublic' };
      }
      this.state.gate.contentId = this.state.folderId;
      this.state.status = 'gate';
      this.render();
      return;
    }

    this.state.folder = data;
    this.state.metadata = metadata ?? null;
    this.state.fileView = data.type === 'file';
    this.state.ownerView = data.isOwner === true;
    this.state.items = data.type === 'folder' ? Object.values(data.children ?? {}) : [];
    // The API only exposes parentFolder to owners — this local memory powers
    // the header "up" arrow (and gate back-links) on foreign folders
    // (files/parentMap.js).
    if (data.type === 'folder' && data.id) {
      rememberParents(this.state.items.map((item) => item.id), data.id);
    }
    this.state.itemCaps = new Map(
      this.state.items.map((item) => [item.id, itemCapabilities(item, account, data)])
    );
    // Clamp the page if a mutation shrunk the folder under us.
    if (metadata?.totalPages && this.state.page > metadata.totalPages) {
      this.state.page = metadata.totalPages;
      this.load({ force: true });
      return;
    }

    // Canonicalize the URL (replaceState, no history entry): the address bar
    // must always hold a link that works for its audience (code for public
    // content, uuid otherwise).
    const canonical = this.urlIdFor(data);
    if (canonical && this.params.contentId !== canonical) {
      // Keep an unlocked-folder password reachable under the new identifier.
      const oldKey = `password|${this.params.contentId}`;
      const saved = sessionStorage.getItem(oldKey);
      if (saved) {
        sessionStorage.setItem(`password|${canonical}`, saved);
        sessionStorage.removeItem(oldKey);
      }
      history.replaceState({}, '', `/d/${canonical}${location.search}`);
      this.params.contentId = canonical;
    }

    this.state.status = 'ready';
    this.render();
    const title = data.isRoot && this.state.ownerView ? 'File Manager' : data.name;
    const headerTitle = $('#header-title');
    if (headerTitle) headerTitle.textContent = title;
    window.dispatchEvent(new CustomEvent('app:files-context', { detail: { ownerView: this.state.ownerView } }));
    maybeShowAds({ folder: data, account });
  }

  async handleLoadError(error) {
    this.state.softLoading = false;
    // A rejected token routes through the canonical account failure policy
    // (drops the account / re-picks one / flags syncError), then we reload.
    if (error instanceof ApiError && error.kind === 'invalid' && error.apiStatus !== 'error-notPremium') {
      try { await refreshActiveAccount({ force: true }); } catch { /* flagged already */ }
      if (!this.destroyed) this.load({ force: true });
      return;
    }
    if (error instanceof ApiError && error.apiStatus === 'error-notFound') {
      this.state.status = 'gate';
      // state.folderId still holds the PREVIOUS folder here, so the URL
      // identifier is the only usable key for the parent map lookup.
      this.state.gate = { kind: 'notFound', contentId: this.params.contentId };
    } else {
      this.state.status = 'error';
      this.state.error = { kind: error.kind ?? 'transient' };
    }
    this.render();
  }

  /** Cache invalidated first, then a force reload — soft by default, so a mutation follow-up never flashes the skeleton. */
  async reload({ soft = true } = {}) {
    invalidateListingCache();
    await this.load({ force: true, soft });
  }

  caps() {
    return folderCapabilities(this.state.folder ?? {}, this.state.account ?? {});
  }

  render() {
    this.pauseFilePreview();
    const { status } = this.state;
    if (status === 'loading') {
      this.root.innerHTML = skeletonTemplate();
    } else if (status === 'gate') {
      // The gate payload carries no parent info — offer the known parent as
      // a way back up.
      const gateParent = knownParentOf(this.state.gate?.contentId);
      this.root.innerHTML = gateTemplate(this.state.gate, {
        parentHref: gateParent ? this.hrefFor({ id: gateParent }) : null,
      });
    } else if (status === 'error') {
      this.root.innerHTML = this.state.error?.kind === 'noAccount'
        ? errorTemplate({ kind: 'transient' })
        : errorTemplate(this.state.error ?? { kind: 'transient' });
    } else {
      // parentFolder is owner-only — fall back to the locally recorded
      // parent (visited earlier this tab session, files/parentMap.js).
      const parentId = this.state.folder?.parentFolder ?? knownParentOf(this.state.folderId);
      const parentHref = parentId ? this.hrefFor({ id: parentId }) : null;
      if (this.state.fileView) {
        this.root.innerHTML = fileViewTemplate(this.state.folder, this.caps(), { parentHref, previewOpen: this.state.filePreviewOpen });
      } else {
        this.root.innerHTML = managerTemplate(this.state, this.caps(), { parentHref });
      }
    }
    refreshIcons();
    this.syncDescription();
    this.wireFilePreview();
    this.syncPageMeta();
  }

  /**
   * Runs at the tail of every render. patchMeta MERGES, so the route's
   * `noindex` always survives the content-driven title/description.
   */
  syncPageMeta() {
    const { status } = this.state;
    if (status === 'loading') return; // skeleton: keep the previous page's meta
    if (status === 'gate') {
      const meta = GATE_META[this.state.gate?.kind] ?? GATE_META.notFound;
      patchMeta(meta);
      markPrerenderReady();
      return;
    }
    if (status === 'error') {
      markPrerenderReady();
      return;
    }
    // ready — the URL was canonicalized just before this render, so
    // location.pathname is the shareable identifier (code vs uuid).
    const data = this.state.folder;
    const title = data.isRoot && this.state.ownerView ? 'File Manager' : data.name;
    // Own content is private/noindexed — only visitor-facing content gets a
    // share-card description.
    let description;
    if (!this.state.ownerView) {
      if (this.state.fileView) {
        description = `${formatBytes(data.size)} file shared with Gofile`;
      } else {
        const count = data.childrenCount ?? 0;
        description = count === 0
          ? 'This folder is empty.'
          : `${formatCount(count)} ${count === 1 ? 'file' : 'files'} shared with Gofile`;
      }
    }
    patchMeta({ title, description, path: location.pathname });
    markPrerenderReady();
  }

  /** Re-applies the clamp/expand state after every render — re-renders must not collapse an expanded description. */
  syncDescription() {
    const section = $('#fm-description', this.root);
    if (!section) return;
    const body = $('#fm-description-body', section);
    const toggle = $('#fm-description-toggle', section);
    const fade = $('#fm-description-fade', section);
    if (!body || !toggle || !fade) return;

    const expanded = this.state.descriptionExpanded === true;
    // Measure with the clamp always applied so "fits" stays correct while expanded.
    body.classList.add(...DESCRIPTION_CLAMP_CLASSES);
    const fits = body.scrollHeight <= body.clientHeight + 2;
    for (const cls of DESCRIPTION_CLAMP_CLASSES) body.classList.toggle(cls, !expanded);
    fade.classList.toggle('hidden', expanded || fits);
    // Pair-toggle with inline-flex (the codebase convention, see the share
    // popup): in the generated CSS .inline-flex sorts AFTER .hidden, so
    // toggling hidden alone could never hide this button — inline-flex won
    // the cascade and "Show more" stayed visible even when the text fit.
    toggle.classList.toggle('hidden', fits);
    toggle.classList.toggle('inline-flex', !fits);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.innerHTML = `${icon(expanded ? 'chevron-up' : 'chevron-down', 'size-3.5')} ${expanded ? 'Show less' : 'Show more'}`;
    refreshIcons();

    // Images load lazily and change the content height — re-measure as each settles.
    for (const img of body.querySelectorAll('img')) {
      if (!img.complete) {
        img.addEventListener('load', () => this.syncDescription(), { once: true });
        img.addEventListener('error', () => this.syncDescription(), { once: true });
      }
    }
  }

  toggleDescription() {
    this.state.descriptionExpanded = !this.state.descriptionExpanded;
    this.syncDescription();
    if (!this.state.descriptionExpanded) {
      // Collapsing while scrolled deep inside a long description would strand
      // the user mid-page — bring the card back under the header.
      const section = $('#fm-description', this.root);
      if (section && section.getBoundingClientRect().top < 0) {
        const top = section.getBoundingClientRect().top + window.scrollY - 72; // h-16 header + margin
        window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
    }
  }

  renderToolbar() {
    const bar = $('#fm-toolbar', this.root);
    if (!bar) return;
    bar.innerHTML = toolbarTemplate(this.state, this.caps(), this.state.folder);
    refreshIcons();
  }

  renderList() {
    const list = $('#fm-list', this.root);
    if (list) {
      list.innerHTML = itemsListTemplate(this.state, this.caps(), this.state.items);
    }
    const notices = $('#fm-notices', this.root);
    if (notices) notices.innerHTML = noticesTemplate(this.state, this.state.items);
    refreshIcons();
  }

  renderFilterBar() {
    const bar = $('#fm-filterbar', this.root);
    if (!bar) return;
    const open = this.state.filterOpen || Boolean(this.state.filter);
    bar.classList.toggle('hidden', !open);
    bar.innerHTML = open ? filterBarTemplate(this.state) : '';
    refreshIcons();
    if (open) bar.querySelector('input')?.focus();
  }

  itemById(id) {
    return this.state.items.find((item) => item.id === id) ?? null;
  }

  /** In-place row sync (no list re-render, no focus loss). Never re-renders the toolbar — callers batch and call renderToolbar() once. */
  setRowSelected(id, selected) {
    if (selected) this.state.selection.add(id);
    else this.state.selection.delete(id);
    const row = this.root.querySelector(`.fm-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    row.dataset.selected = String(selected);
    row.classList.toggle('bg-brand-500/10', selected);
    row.classList.toggle('hover:bg-white/[0.03]', !selected);
    const button = row.querySelector('[data-action="toggle-select"]');
    button?.setAttribute('aria-pressed', String(selected));
    if (button) button.innerHTML = selectCheckboxHtml(selected);
  }

  toggleSelect(id) {
    if (!this.itemById(id)) return;
    const selected = !this.state.selection.has(id);
    this.setRowSelected(id, selected);
    // A plain toggle moves the shift-click anchor — the range inherits THIS action's state.
    this.selectionAnchor = { id, selected };
    this.renderToolbar();
  }

  /** Shift-click: rows between anchor and click inherit the anchor's state; the outside selection is kept. */
  selectRangeTo(id) {
    const items = this.state.items;
    const toIndex = items.findIndex((item) => item.id === id);
    const fromIndex = this.selectionAnchor
      ? items.findIndex((item) => item.id === this.selectionAnchor.id)
      : -1;
    if (toIndex === -1 || fromIndex === -1) {
      this.toggleSelect(id);
      return;
    }
    const { selected } = this.selectionAnchor;
    const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    for (let index = start; index <= end; index++) this.setRowSelected(items[index].id, selected);
    this.renderToolbar();
  }

  selectAll() {
    for (const item of this.state.items) this.state.selection.add(item.id);
    this.render();
  }

  clearSelection() {
    if (this.state.selection.size === 0) return;
    this.state.selection.clear();
    this.selectionAnchor = null;
    for (const row of this.root.querySelectorAll('.fm-row[data-selected="true"]')) {
      row.dataset.selected = 'false';
      row.classList.remove('bg-brand-500/10');
      row.classList.add('hover:bg-white/[0.03]');
      const button = row.querySelector('[data-action="toggle-select"]');
      button?.setAttribute('aria-pressed', 'false');
      if (button) button.innerHTML = selectCheckboxHtml(false);
    }
    this.renderToolbar();
  }

  selectedItems() {
    return this.state.items.filter((item) => this.state.selection.has(item.id));
  }

  onClick = (event) => {
    // The click synthesized after a long-press selection must not open anything.
    if (this.suppressClickOnce) {
      this.suppressClickOnce = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || !this.root.contains(actionEl)) return;
    const action = actionEl.dataset.action;
    const row = event.target.closest('.fm-row[data-id]');
    const id = row?.dataset.id;
    const item = (id ? this.itemById(id) : null) ?? (this.state.fileView ? this.state.folder : null);

    // Plain left clicks on /d/ links navigate in place; modified clicks and
    // middle clicks fall through to the browser.
    if (action === 'navigate') {
      const href = actionEl.getAttribute('href') ?? '';
      const internal = href.startsWith('/d/');
      const plainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
      if (internal && plainClick) {
        event.preventDefault();
        event.stopPropagation();
        this.navigateTo(null, href);
      } else if (internal) {
        event.stopPropagation(); // keep the SPA router out; browser default handles the rest
      }
      return;
    }

    switch (action) {
      case 'toggle-select': id && (event.shiftKey ? this.selectRangeTo(id) : this.toggleSelect(id)); break;
      case 'open-file': item && this.openFile(item); break;
      // On the single-file view the preview is the inline card (no popup —
      // the lightbox is a folder-listing feature): the button toggles it.
      case 'preview': this.state.fileView ? this.toggleFilePreview() : item && this.previewItem(item); break;
      case 'download': this.state.fileView ? this.downloadItem(this.state.folder) : item ? this.downloadItem(item) : this.downloadFolder(); break;
      case 'item-menu': item && this.openItemMenu(actionEl, item); break;
      case 'folder-menu': this.openFolderMenu(actionEl); break;
      case 'select-all': this.selectAll(); break;
      case 'clear-selection': this.clearSelection(); break;
      case 'download-selected': this.downloadSelected(); break;
      case 'copy-selected': this.setClipboard('copy', this.selectedItems()); break;
      case 'move-selected': this.setClipboard('move', this.selectedItems()); break;
      case 'restore-selected': this.restoreItems(this.selectedItems()); break;
      case 'delete-selected': this.deleteItems(this.selectedItems()); break;
      case 'clipboard-menu': this.openClipboardMenu(actionEl); break;
      case 'upload': this.pickFiles(); break;
      case 'create-folder': this.createFolder(); break;
      case 'create-menu': this.openCreateMenu(actionEl); break;
      case 'search': this.openSearch(); break;
      case 'toggle-filter': this.state.filterOpen = !this.state.filterOpen; this.renderFilterBar(); break;
      case 'clear-filter': this.applyFilter(''); break;
      case 'sort-menu': this.openSortMenu(actionEl); break;
      case 'display-menu': this.openDisplayMenu(actionEl); break;
      case 'refresh': this.reload(); break;
      case 'retry': this.state.error?.kind === 'noAccount' ? initAccounts().then(() => this.load({ force: true })) : this.load({ force: true }); break;
      case 'page-prev': this.goToPage(this.state.page - 1); break;
      case 'page-next': this.goToPage(this.state.page + 1); break;
      case 'page-first': this.goToPage(1); break;
      case 'page-last': this.goToPage(this.state.metadata?.totalPages ?? 1); break;
      case 'import': item ? this.importItems([item]) : this.importItems([this.state.folder]); break;
      case 'share': this.shareItem(item ?? this.state.folder); break;
      case 'properties': this.showProperties(item ?? this.state.folder); break;
      case 'toggle-description': this.toggleDescription(); break;
      case 'edit-description': this.editDescription(this.state.folder); break;
      case 'report-abuse': this.reportAbuse(); break;
      default: break;
    }
  };

  onSubmit = (event) => {
    const form = event.target.closest('form[data-fm]');
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.fm;
    if (kind === 'password') {
      this.unlockFolder(form.elements.password.value);
    } else if (kind === 'filter') {
      this.applyFilter(form.elements.filter.value);
    } else if (kind === 'page') {
      this.goToPage(Number.parseInt(form.elements.page.value, 10));
    }
  };

  onContextMenu = (event) => {
    const row = event.target.closest('.fm-row[data-id]');
    if (!row) return;
    const item = this.itemById(row.dataset.id);
    if (!item) return;
    event.preventDefault();
    // Touch long-press ALSO fires contextmenu (~500ms) right after our
    // selection timer (450ms): suppress the menu in that case — on touch,
    // long-press means "select", not "open the menu".
    if (this.longPress || this.suppressClickOnce) return;
    // Selection is an explicit gesture only (checkbox, shift-click range,
    // long-press, select-all) — a right-click NEVER modifies it, so opening
    // a menu can never destroy a multi-selection as a side effect. The menu
    // always acts on the row under the cursor: mark it as the target (unless
    // it's selected, i.e. already highlighted) only while the menu is open.
    // A second right-click elsewhere closes the first menu on pointerdown —
    // its onClose fires before the new target is marked, so the highlight
    // can't leak.
    if (row.dataset.selected !== 'true') row.dataset.contextTarget = 'true';
    // OS-style targeting: a right-click INSIDE a multi-selection opens the
    // bulk menu (actions apply to the whole selection); anywhere else, the
    // menu acts on the single item under the cursor.
    const bulk = this.state.selection.has(item.id) && this.state.selection.size > 1;
    openContextMenu(event, bulk ? this.selectionMenuItems() : this.itemMenuItems(item), {
      onClose: () => delete row.dataset.contextTarget,
    });
  };

  onPointerDown = (event) => {
    if (event.pointerType !== 'touch') return;
    const row = event.target.closest('.fm-row[data-id]');
    if (!row || event.target.closest('[data-action="toggle-select"], [data-action="item-menu"]')) return;
    this.cancelLongPress();
    this.longPress = {
      pointerId: event.pointerId,
      row,
      id: row.dataset.id,
      startX: event.clientX,
      startY: event.clientY,
      fired: false,
      timer: setTimeout(() => {
        if (!this.longPress) return;
        this.longPress.fired = true;
        this.toggleSelect(this.longPress.id);
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS),
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
  };

  onPointerMove = (event) => {
    if (!this.longPress || event.pointerId !== this.longPress.pointerId) return;
    if (Math.hypot(event.clientX - this.longPress.startX, event.clientY - this.longPress.startY) > 10) {
      this.cancelLongPress();
    }
  };

  onPointerUp = () => {
    // The synthesized click lands right after pointerup — swallow exactly one.
    if (!this.longPress) return;
    const fired = this.longPress.fired;
    this.cancelLongPress();
    if (fired) {
      this.suppressClickOnce = true;
      setTimeout(() => { this.suppressClickOnce = false; }, 400);
    }
  };

  cancelLongPress() {
    if (!this.longPress) return;
    clearTimeout(this.longPress.timer);
    this.longPress = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  /** Window-level shortcuts — inert while loading, when an overlay owns the keyboard, in editable fields, or on auto-repeat. */
  onKeyDown = (event) => {
    if (this.destroyed || this.state.status !== 'ready' || this.state.softLoading) return;
    if (layerCount() > 0 || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;

    const mod = event.ctrlKey || event.metaKey;

    // Delete: the selection — or, with nothing selected, the viewed folder
    // (canDeleteSelf already excludes root and recycle-bin context). Never
    // on the single-file view (view-only by design).
    if (event.key === 'Delete' && !mod && !event.altKey && !event.shiftKey) {
      if (this.state.selection.size > 0) {
        if (this.caps().canDelete) {
          event.preventDefault();
          this.deleteItems(this.selectedItems());
        }
      } else if (!this.state.fileView && this.caps().canDeleteSelf) {
        event.preventDefault();
        this.deleteItems([this.state.folder]);
      }
      return;
    }

    // Escape clears the selection (overlays get their own Escape first).
    if (event.key === 'Escape' && !mod && !event.altKey && !event.shiftKey) {
      if (this.state.selection.size > 0) this.clearSelection();
      return;
    }

    if (!mod || event.altKey || event.shiftKey) return;

    switch (event.key.toLowerCase()) {
      case 'a':
        if (!this.state.fileView && this.state.items.length > 0) {
          event.preventDefault();
          this.selectAll();
        }
        break;
      case 'c':
      case 'x': {
        // Never on the single-file view (view-only — management from the folder).
        if (this.state.fileView) break;
        const op = event.key.toLowerCase() === 'c' ? 'copy' : 'move';
        const items = this.selectedItems();
        const allowed = op === 'copy' ? this.caps().canCopy : this.caps().canMove;
        // Nothing to act on → no preventDefault: a native text copy still
        // works when the user selected page text instead of rows.
        if (!allowed || items.length === 0) break;
        event.preventDefault();
        this.setClipboard(op, items);
        break;
      }
      case 'v':
        if (this.state.fileView || !this.state.clipboard) break;
        event.preventDefault();
        this.pasteFromShortcut();
        break;
      default:
        break;
    }
  };

  /** Only file drags count — links/text keep their native behavior. */
  hasDraggedFiles(event) {
    return [...(event.dataTransfer?.types ?? [])].includes('Files');
  }

  /** Page-wide drops only upload on a ready, owned folder view. */
  canDropFiles() {
    return this.state.status === 'ready' && !this.state.fileView && this.caps().canUpload;
  }

  onDragEnter = (event) => {
    if (!this.hasDraggedFiles(event)) return;
    event.preventDefault();
    this.dragDepth++;
    if (this.canDropFiles()) $('#fm-dropzone', this.root)?.classList.remove('hidden');
  };

  onDragOver = (event) => {
    if (!this.hasDraggedFiles(event)) return;
    event.preventDefault(); // required to allow the drop
  };

  onDragLeave = (event) => {
    if (this.dragDepth === 0 || !this.hasDraggedFiles(event)) return;
    this.dragDepth--;
    if (this.dragDepth === 0) $('#fm-dropzone', this.root)?.classList.add('hidden');
  };

  onDrop = (event) => {
    if (!this.hasDraggedFiles(event)) return;
    event.preventDefault(); // a drop anywhere must never navigate the browser away
    this.dragDepth = 0;
    $('#fm-dropzone', this.root)?.classList.add('hidden');
    if (!this.canDropFiles()) return;
    const { files, skippedFolders } = filesFromDrop(event.dataTransfer);
    if (skippedFolders > 0) {
      toast({
        title: `${skippedFolders} folder${skippedFolders > 1 ? 's' : ''} skipped`,
        message: 'Folder uploads are not supported yet — select the files inside instead.',
        type: 'warning',
      });
    }
    this.startUpload(files);
  };

  startUpload(files) {
    if (!files?.length || !this.state.account?.token || !this.state.folderId) return;
    enqueueUpload({
      kind: 'manager',
      account: this.state.account,
      folderId: this.state.folderId,
      folderName: this.state.folder?.name ?? null,
      files,
    });
  }

  /** In-place navigation (pushState + listing swap). `force` invalidates the cache; `replace` swaps the history entry; `filter` lands on the folder with a name filter pre-applied (e.g. from a search result). */
  navigateTo(content, href, { force = false, replace = false, filter = '' } = {}) {
    const identifier = href ? href.split('/').filter(Boolean).pop() : this.urlIdFor(content);
    if (!identifier) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', href ?? this.hrefFor(content));
    this.state.page = 1;
    this.state.filter = filter;
    this.state.filterOpen = Boolean(filter);
    this.state.selection.clear();
    this.selectionAnchor = null;
    this.params = { contentId: identifier };
    window.scrollTo({ top: 0, behavior: 'instant' });
    // The pushed href carries no query string — put ?filter= back so the
    // address bar (and a refresh) keeps the filtered view.
    if (filter) this.syncUrl();
    if (force) invalidateListingCache();
    this.load({ force });
  }

  syncUrl() {
    const url = new URL(location.href);
    if (this.state.page > 1) url.searchParams.set('page', String(this.state.page));
    else url.searchParams.delete('page');
    if (this.state.filter) url.searchParams.set('filter', this.state.filter);
    else url.searchParams.delete('filter');
    history.replaceState({}, '', url.pathname + url.search);
  }

  setSort(field) {
    const sort = this.state.sort.field === field
      ? { field, direction: -this.state.sort.direction }
      : { field, direction: field === 'name' || field === 'mimetype' ? 1 : -1 };
    this.state.sort = sort;
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    this.state.page = 1;
    this.syncUrl();
    this.load({ force: true });
  }

  applyFilter(value) {
    this.state.filter = String(value ?? '').trim();
    this.state.filterOpen = Boolean(this.state.filter);
    this.state.page = 1;
    this.syncUrl();
    this.load({ force: true });
  }

  goToPage(page) {
    const total = this.state.metadata?.totalPages ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > total || page === this.state.page) return;
    this.state.page = page;
    this.syncUrl();
    this.load();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  itemMenuItems(item) {
    const caps = this.state.itemCaps.get(item.id) ?? itemCapabilities(item, this.state.account, this.state.folder);
    const isFolder = item.type === 'folder';
    const previewable = caps.canPreview && isPreviewable(item) && !item.isFrozen && !item.overloaded;
    const items = [];

    if (caps.canOpen && isFolder) items.push({ label: 'Open', icon: 'folder-open', onClick: () => this.navigateTo(item) });
    if (previewable) items.push({ label: 'Preview', icon: 'eye', onClick: () => this.previewItem(item) });
    if (caps.canDownload) items.push({ label: isFolder ? 'Download as ZIP' : 'Download', icon: 'download', onClick: () => this.downloadItem(item) });
    if (caps.canImport) items.push({ label: 'Import to my files', icon: 'import', onClick: () => this.importItems([item]) });
    // One top-level entry per content-settings option (no submenu) — the
    // popups live in files/settings.js.
    const settings = this.contentSettingsMenuItems(item);
    if (caps.canShare || caps.canManageAccess || settings.length > 0) items.push({ type: 'separator' });
    if (caps.canShare) items.push({ label: 'Share', icon: 'share-2', onClick: () => this.shareItem(item) });
    if (caps.canManageAccess) items.push({ label: 'Access & permissions', icon: 'shield', onClick: () => this.manageAccess(item) });
    items.push(...settings);
    if (caps.canRename || caps.canCopy || caps.canMove) items.push({ type: 'separator' });
    if (caps.canRename) items.push({ label: 'Rename', icon: 'pencil', onClick: () => this.renameItem(item) });
    if (caps.canCopy) items.push({ label: 'Copy', icon: 'copy', hint: modHint('C'), onClick: () => this.setClipboard('copy', [item]) });
    if (caps.canMove) items.push({ label: 'Move', icon: 'folder-output', hint: modHint('X'), onClick: () => this.setClipboard('move', [item]) });
    if (caps.canRestore) items.push({ label: 'Restore', icon: 'undo-2', onClick: () => this.restoreItems([item]) });
    if (caps.canDelete) items.push({ label: caps.deleteLabel, icon: 'trash-2', hint: 'Del', danger: true, onClick: () => this.deleteItems([item]) });
    items.push({ type: 'separator' });
    if (caps.canShowProperties) items.push({ label: 'Properties', icon: 'info', onClick: () => this.showProperties(item) });
    return items;
  }

  /**
   * Menu for a right-click INSIDE a multi-selection: every action applies
   * to the whole selection (OS-style). Mirrors the toolbar's selection bar
   * — same folder-level caps, same handlers.
   */
  selectionMenuItems() {
    const items = this.selectedItems();
    const count = items.length; // always >= 2 — see onContextMenu
    const caps = this.caps();
    const inRecycle = caps.context === 'recycle';
    const menu = [];
    if (!inRecycle && caps.canDownload) menu.push({ label: `Download ${count} items as ZIP`, icon: 'download', onClick: () => this.downloadSelected() });
    if (!inRecycle && caps.canCopy) menu.push({ label: `Copy ${count} items`, icon: 'copy', hint: modHint('C'), onClick: () => this.setClipboard('copy', items) });
    if (!inRecycle && caps.canMove) menu.push({ label: `Move ${count} items`, icon: 'folder-output', hint: modHint('X'), onClick: () => this.setClipboard('move', items) });
    if (inRecycle && caps.canRestore) menu.push({ label: `Restore ${count} items`, icon: 'undo-2', onClick: () => this.restoreItems(items) });
    if (caps.canDelete) menu.push({ label: inRecycle ? `Delete ${count} items permanently` : `Delete ${count} items`, icon: 'trash-2', hint: 'Del', danger: true, onClick: () => this.deleteItems(items) });
    if (menu.length > 0) menu.push({ type: 'separator' });
    menu.push({ label: 'Clear selection', icon: 'x', onClick: () => this.clearSelection() });
    return menu;
  }

  openItemMenu(anchor, item) {
    openMenu({ anchor, placement: 'bottom-end', items: this.itemMenuItems(item) });
  }

  contentSettingsMenuItems(item) {
    // Folder-level caps apply only inside a folder — on the single-file
    // view state.folder is a file and item caps rule.
    const isCurrentFolder = item === this.state.folder && !this.state.fileView;
    const caps = isCurrentFolder
      ? this.caps()
      : this.state.itemCaps.get(item.id) ?? itemCapabilities(item, this.state.account, this.state.folder);
    const entries = [];
    if (caps.canEditDescription) entries.push({ label: 'Description', icon: 'align-left', onClick: () => this.editDescription(item) });
    if (caps.canEditTags) entries.push({ label: 'Tags', icon: 'tags', onClick: () => this.editTags(item) });
    if (caps.canManageDirectLinks) entries.push({ label: 'Direct links', icon: 'link', onClick: () => this.manageDirectLinks(item) });
    return entries;
  }

  openFolderMenu(anchor) {
    const folder = this.state.folder;
    const caps = this.caps();
    const items = [];

    if (caps.context === 'recycle') {
      if (caps.canRestoreFolder) items.push({ label: 'Restore this folder', icon: 'undo-2', onClick: () => this.restoreItems([folder]) });
      if (caps.canEmptyRecycle) items.push({ label: 'Empty recycle bin', icon: 'trash-2', danger: true, onClick: () => this.emptyRecycleBin() });
      if (caps.canDisableRecycle) items.push({ label: 'Disable recycle bin', icon: 'circle-off', onClick: () => this.disableRecycleBin() });
    } else {
      // The recycle bin is intentionally not here — it lives outside the
      // folder tree, reachable from the sidebar account menu.
      if (caps.canShare) items.push({ label: 'Share', icon: 'share-2', onClick: () => this.shareItem(folder) });
      if (caps.canManageAccess) items.push({ label: 'Access & permissions', icon: 'shield', onClick: () => this.manageAccess(folder) });
      items.push(...this.contentSettingsMenuItems(folder));
      if (items.length > 0) items.push({ type: 'separator' });
      if (caps.canDownload) items.push({ label: 'Download as ZIP', icon: 'download', onClick: () => this.downloadFolder() });
      if (caps.canImport) items.push({ label: 'Import to my files', icon: 'import', onClick: () => this.importItems([folder]) });
      // Rename is allowed on the root too (the API has no isRoot guard on
      // the name attribute) — only copy/move/delete make no sense for the root.
      if (caps.canRename) items.push({ type: 'separator' }, { label: 'Rename', icon: 'pencil', onClick: () => this.renameItem(folder) });
      if (caps.canCopy && !folder.isRoot) items.push({ label: 'Copy', icon: 'copy', onClick: () => this.setClipboard('copy', [folder]) });
      if (caps.canMove && !folder.isRoot) items.push({ label: 'Move', icon: 'folder-output', onClick: () => this.setClipboard('move', [folder]) });
      if (caps.canDeleteSelf) items.push({ label: 'Delete', icon: 'trash-2', hint: 'Del', danger: true, onClick: () => this.deleteItems([folder]) });
      // "Report abuse" is deliberately a subtle bottom-of-page button, not
      // a menu item.
    }
    items.push({ type: 'separator' });
    items.push({ label: 'Properties', icon: 'info', onClick: () => this.showProperties(folder) });

    openMenu({ anchor, placement: 'bottom-end', items });
  }

  openSortMenu(anchor) {
    const { sort } = this.state;
    const labels = { createTime: 'Created', name: 'Name', size: 'Size', mimetype: 'Type', recycleDeletedAt: 'Removal date' };
    const hints = {
      createTime: sort.direction === 1 ? 'oldest first' : 'newest first',
      name: sort.direction === 1 ? 'A → Z' : 'Z → A',
      size: sort.direction === 1 ? 'smallest first' : 'largest first',
      mimetype: sort.direction === 1 ? 'A → Z' : 'Z → A',
      recycleDeletedAt: sort.direction === 1 ? 'oldest first' : 'newest first',
    };
    openMenu({
      anchor,
      placement: 'bottom-end',
      items: () => [
        { type: 'label', label: 'Sort by' },
        ...this.caps().sortFields.map((field) => ({
          label: labels[field],
          checked: this.state.sort.field === field,
          hint: this.state.sort.field === field ? hints[field] : '',
          onClick: () => this.setSort(field),
        })),
      ],
    });
  }

  openDisplayMenu(anchor) {
    openMenu({
      anchor,
      placement: 'bottom-end',
      items: () => {
        const items = [
          { type: 'label', label: 'Display' },
          {
            label: 'Show thumbnails',
            checked: this.state.showThumbnails,
            onClick: () => {
              this.state.showThumbnails = !this.state.showThumbnails;
              setShowThumbnails(this.state.showThumbnails);
              this.renderList();
            },
          },
        ];
        // The size option only makes sense while thumbnails are visible.
        if (this.state.showThumbnails) {
          items.push({
            label: 'Thumbnail size',
            icon: 'proportions',
            hint: THUMBNAIL_SIZES[this.state.thumbnailSize],
            submenu: Object.entries(THUMBNAIL_SIZES).map(([value, label]) => ({
              label,
              checked: this.state.thumbnailSize === value,
              onClick: () => this.setThumbnailSize(value),
            })),
          });
        }
        return items;
      },
    });
  }

  setThumbnailSize(size) {
    if (!(size in THUMBNAIL_SIZES) || this.state.thumbnailSize === size) return;
    this.state.thumbnailSize = size;
    persistThumbnailSize(size);
    this.renderList();
  }

  openCreateMenu(anchor) {
    const caps = this.caps();
    const items = [];
    if (caps.canUpload) items.push({ label: 'Upload files', icon: 'upload', onClick: () => this.pickFiles() });
    if (caps.canCreateFolder) items.push({ label: 'New folder', icon: 'folder-plus', onClick: () => this.createFolder() });
    if (items.length) openMenu({ anchor, placement: 'bottom-start', items });
  }

  /** Clipboard vs current view — shared by the chip menu and Ctrl+V. A copy into its own source folder is allowed (the API duplicates); a move is not. */
  pasteState() {
    const clipboard = this.state.clipboard;
    if (!clipboard) return 'empty';
    if (clipboard.accountId !== this.state.account?.id) return 'wrongAccount';
    if (!this.caps().canPaste) return 'notAllowed';
    if (clipboard.op === 'move' && clipboard.sourceFolderId === this.state.folderId) return 'sameFolder';
    return 'ok';
  }

  openClipboardMenu(anchor) {
    const clipboard = this.state.clipboard;
    if (!clipboard) return;
    const state = this.pasteState();
    const items = [
      { type: 'label', label: `${clipboard.op === 'move' ? 'Moving' : 'Copying'} ${clipboard.ids.length} item${clipboard.ids.length > 1 ? 's' : ''}` },
      {
        label: 'Paste here',
        icon: 'clipboard-paste',
        hint: modHint('V'),
        disabled: state !== 'ok',
        onClick: () => this.pasteClipboard(),
      },
      { label: 'Clear', icon: 'x', onClick: () => this.setClipboard(null) },
    ];
    if (state === 'wrongAccount') items.splice(1, 0, { type: 'label', label: 'Switch back to the source account to paste' });
    else if (state === 'sameFolder') items.splice(1, 0, { type: 'label', label: 'Navigate to another folder to paste' });
    openMenu({ anchor, placement: 'bottom-end', items });
  }

  /** Ctrl+V: paste when valid, otherwise explain why nothing happened (silent only with no clipboard or an un-pastable view). */
  pasteFromShortcut() {
    const state = this.pasteState();
    if (state === 'ok') {
      this.pasteClipboard();
    } else if (state === 'wrongAccount') {
      toast.error('Switch back to the account that owns these items to paste them.');
    } else if (state === 'sameFolder') {
      toast({ title: 'You are moving these items', message: 'Navigate to another folder to paste them.', type: 'info' });
    }
  }

  openFile(item) {
    if (isPreviewable(item) && !item.isFrozen && !item.overloaded) this.previewItem(item);
    else this.downloadItem(item);
  }

  /** Media lightbox (files/preview.js). The playlist is the CURRENT page's previewable items in display order — the single-file view never reaches this (its preview is the inline card). */
  previewItem(item) {
    if (item.isFrozen) return this.showFrozen(item);
    if (item.overloaded) return this.showOverloaded(item);
    const playlist = previewableItems(this.state.items);
    const index = playlist.findIndex((entry) => entry.id === item.id);
    openMediaPreview(item, {
      playlist: index === -1 ? [item] : playlist,
      index: Math.max(0, index),
      onDownload: (current) => this.downloadItem(current),
    });
  }

  /** Required before the root is re-rendered or discarded — a detached <video>/<audio> would keep playing (and downloading). */
  pauseFilePreview() {
    $('#fm-file-preview video, #fm-file-preview audio', this.root)?.pause?.();
  }

  wireFilePreview() {
    const card = $('#fm-file-preview', this.root);
    if (card) mountInlinePreview(card);
  }

  /** In-place show/hide of the inline card — no re-render, so the media element survives (closing pauses it). */
  toggleFilePreview() {
    const card = $('#fm-file-preview', this.root);
    if (!card) return; // non-media file: no preview to toggle
    this.state.filePreviewOpen = !this.state.filePreviewOpen;
    card.classList.toggle('hidden', !this.state.filePreviewOpen);
    if (!this.state.filePreviewOpen) this.pauseFilePreview();
    const button = $('[data-action="preview"]', this.root);
    if (button) {
      button.setAttribute('aria-expanded', String(this.state.filePreviewOpen));
      button.innerHTML = filePreviewButtonHtml(this.state.filePreviewOpen);
      refreshIcons();
    }
  }

  downloadItem(item) {
    if (item.type === 'folder') return this.zipDownload(item.id);
    if (item.isFrozen) return this.showFrozen(item);
    if (item.overloaded) return this.showOverloaded(item);
    const anchor = document.createElement('a');
    anchor.href = item.link;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }

  downloadFolder() {
    return this.zipDownload(this.state.folderId);
  }

  downloadSelected() {
    const items = this.selectedItems();
    if (items.length === 0) return;
    if (items.length === 1 && items[0].type === 'file') return this.downloadItem(items[0]);
    return this.zipDownload(this.state.folderId, items.map((item) => item.id));
  }

  async zipDownload(contentId, childrenIds) {
    if (this.state.account?.tier !== 'premium') return showPremiumUpsell('Bulk & folder downloads');
    if (this.pending) return;
    this.pending = true;
    const busy = toast.busy({ title: 'Preparing the ZIP…' });
    try {
      // A listing call on the target folder is what authorizes the direct
      // link — required before a req link will stream.
      if (contentId !== this.state.folderId) {
        await contents.getFolder(this.state.account.token, contentId, { pageSize: 1 });
      }
      const data = await contents.createDirectLink(this.state.account.token, contentId, {
        contentIdsToZip: childrenIds,
        expireTime: Math.floor(Date.now() / 1000) + 5 * 60,
        isReqLink: true,
        password: sessionStorage.getItem(`password|${this.params.contentId}`) ?? undefined,
      });
      if (!data?.directLink) throw new Error('error-noLink');
      const anchor = document.createElement('a');
      anchor.href = data.directLink;
      anchor.rel = 'noopener';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      busy.succeed({ title: 'Download started' });
    } catch (error) {
      if (contents.isPremiumRequired(error)) {
        busy.dismiss();
        showPremiumUpsell('Bulk & folder downloads');
      } else {
        busy.fail({ title: this.errorMessage(error, 'Could not prepare the download') });
      }
    } finally {
      this.pending = false;
    }
  }

  showFrozen(item) {
    popup.open({
      title: 'File in cold storage',
      content: `
        <div class="flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/25">${icon('snowflake', 'size-5')}</span>
          <div class="text-sm leading-relaxed text-slate-300">
            <p><strong class="text-white">${escapeHtml(item.name)}</strong> exceeded its storage period and was moved to cold storage.</p>
            <p class="mt-2 text-slate-400">It can no longer be downloaded directly. Importing it into your own account restores access — importing requires Premium.</p>
          </div>
        </div>`,
      actions: [
        { label: 'Close', variant: 'ghost' },
        ...(this.state.account?.tier === 'premium' && !item.isOwner
          ? [{ label: 'Import to my files', variant: 'primary', onClick: (h) => { h.close(); this.importItems([item]); } }]
          : [{ label: 'See Premium', variant: 'primary', onClick: (h) => { h.close(); navigate('/premium'); } }]),
      ],
    });
  }

  showOverloaded(item) {
    popup.alert({
      title: 'Server currently overloaded',
      message: `The server hosting "${item.name}" is currently overloaded. Free downloads are paused for a while — try again later, or upgrade to Premium for priority access.`,
    });
  }

  pickFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.className = 'hidden';
    input.addEventListener('change', () => {
      const files = input.files;
      input.remove();
      this.startUpload([...(files ?? [])]);
    });
    document.body.append(input);
    input.click();
  }

  async createFolder() {
    if (this.pending) return;
    const parent = this.state.folder;
    const handle = popup.open({
      title: 'New folder',
      content: `
        <form data-popup-form class="space-y-4">
          <div>
            <label for="fm-new-folder-name" class="mb-1.5 block text-xs font-medium text-slate-400">Folder name</label>
            <input id="fm-new-folder-name" name="name" type="text" required maxlength="200" class="input" placeholder="e.g. Holiday photos" autocomplete="off" />
          </div>
          <label class="flex items-center gap-2.5 text-sm text-slate-300">
            <input type="checkbox" name="public" ${parent?.public ? 'checked' : ''} class="size-4 rounded border-white/20 bg-surface-base text-brand-500 focus:ring-brand-500/40" />
            Publicly accessible
            <span class="text-xs text-slate-500">(anyone with the link can view it)</span>
          </label>
        </form>`,
      initialFocus: '#fm-new-folder-name',
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        { label: 'Create folder', variant: 'primary', onClick: (h) => {
          const form = h.body.querySelector('form[data-popup-form]');
          const name = form.elements.name.value.trim();
          if (!name) return false;
          h.close({ name, public: form.elements.public.checked });
        } },
      ],
      onOpen: (body) => {
        // Enter inside the form submits = primary action.
        body.querySelector('form')?.addEventListener('submit', (event) => {
          event.preventDefault();
          handle.root.querySelector('[data-action="1"]')?.click();
        });
      },
    });

    const result = await handle.closed;
    if (!result || this.pending) return;
    this.pending = true;
    const busy = toast.busy({ title: `Creating “${result.name}”…` });
    try {
      await contents.createFolder(this.state.account.token, this.state.folderId, result.name, result.public);
      busy.succeed({ title: `Folder “${result.name}” created` });
      this.reload();
    } catch (error) {
      busy.fail({ title: this.errorMessage(error, 'Could not create the folder') });
    } finally {
      this.pending = false;
    }
  }

  async renameItem(item) {
    if (this.pending) return;
    const name = await popup.prompt({
      title: `Rename ${item.type === 'folder' ? 'folder' : 'file'}`,
      label: 'New name',
      value: item.name,
      validate: (value) => (value.trim().length > 0 ? true : 'The name cannot be empty'),
    });
    if (name == null || name.trim() === '' || name === item.name || this.pending) return;
    this.pending = true;
    const busy = toast.busy({ title: `Renaming “${item.name}”…` });
    try {
      await contents.updateContent(this.state.account.token, item.id, 'name', name.trim());
      busy.succeed({ title: `Renamed to “${name.trim()}”` });
      this.reload();
    } catch (error) {
      busy.fail({ title: this.errorMessage(error, 'Could not rename') });
    } finally {
      this.pending = false;
    }
  }

  async deleteItems(items, proof) {
    if (!items?.length || this.pending) return;
    const caps = this.caps();
    const hasRecycleBin = Boolean(this.state.account?.recycleFolder);
    const permanent = caps.deleteMode === 'permanent' || !hasRecycleBin;
    const deletingSelf = items.length === 1 && items[0].id === this.state.folderId;

    if (!proof) {
      const shown = items.slice(0, 5);
      const handle = popup.open({
        title: permanent ? 'Delete permanently?' : `Delete ${items.length > 1 ? `${items.length} items` : 'this item'}?`,
        content: `
          <div class="space-y-3">
            <ul class="space-y-1.5 text-sm">
              ${shown.map((item) => `
                <li class="flex items-center gap-2 text-slate-300">
                  ${icon(item.type === 'folder' ? 'folder' : 'file', `size-4 shrink-0 ${item.type === 'folder' ? 'text-amber-400' : 'text-slate-400'}`)}
                  <span class="truncate">${escapeHtml(item.name)}</span>
                </li>`).join('')}
              ${items.length > shown.length ? `<li class="text-xs italic text-slate-500">…and ${items.length - shown.length} more</li>` : ''}
            </ul>
            ${deletingSelf && items[0].childrenCount > 0 ? `
              <p class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                This folder contains <strong>${formatCount(items[0].childrenCount)}</strong> item${items[0].childrenCount === 1 ? '' : 's'} — everything inside will be deleted too.
              </p>` : ''}
            <p class="text-xs leading-relaxed text-slate-400">
              ${permanent
                ? 'Items will be <strong class="text-red-400">permanently deleted</strong> and cannot be recovered.'
                : 'Items will be moved to your <strong class="text-white">recycle bin</strong> first — you can restore them from there.'}
            </p>
          </div>`,
        actions: [
          { label: 'Cancel', variant: 'ghost' },
          { label: permanent ? 'Delete permanently' : 'Delete', variant: 'danger', onClick: (h) => h.close(true) },
        ],
      });
      if (!(await handle.closed)) return;
    }

    this.pending = true;
    const label = items.length > 1 ? `${items.length} items` : `“${items[0].name}”`;
    const busy = toast.busy({
      title: permanent ? `Deleting ${label}…` : `Moving ${label} to the recycle bin…`,
    });
    try {
      await contents.deleteContents(this.state.account.token, items.map((item) => item.id), proof);
      busy.succeed({
        title: items.length > 1 ? `${items.length} items deleted` : `“${items[0].name}” deleted`,
      });
      if (deletingSelf) {
        const parent = this.state.folder?.parentFolder;
        if (parent) {
          // force: the parent's cached listing still shows the deleted item.
          // replace: the deleted folder's URL is dead — drop it from history
          // so Back doesn't land on a notFound gate.
          this.navigateTo({ id: parent }, null, { force: true, replace: true });
          return;
        }
      }
      this.reload();
    } catch (error) {
      if (error instanceof ApiError && error.apiStatus === 'error-proofNeeded') {
        // Not a user-facing failure — no error toast; ask for the proof.
        // The guard is released first: the retry below re-enters deleteItems.
        busy.dismiss();
        this.pending = false;
        const justification = await popup.prompt({
          title: 'Justification required',
          label: 'Why are you deleting this content? (sent to the moderation log)',
          validate: (value) => (value.trim().length > 0 ? true : 'A justification is required'),
        });
        // Awaited (not `return this.deleteItems(...)`): the outer finally must
        // run only after the retry has settled, or the guard would be
        // released while the retry is still in flight.
        if (justification?.trim()) {
          await this.deleteItems(items, justification.trim());
        }
        return;
      }
      busy.fail({ title: this.errorMessage(error, 'Could not delete') });
    } finally {
      this.pending = false;
    }
  }

  async restoreItems(items) {
    if (!items?.length || this.pending) return;
    this.pending = true;
    const label = items.length > 1 ? `${items.length} items` : `“${items[0].name}”`;
    const busy = toast.busy({ title: `Restoring ${label}…` });
    try {
      await contents.restoreContents(this.state.account.token, items.map((item) => item.id));
      busy.succeed({
        title: items.length > 1 ? `${items.length} items restored` : `“${items[0].name}” restored`,
      });
      const restoringSelf = items.length === 1 && items[0].id === this.state.folderId;
      if (restoringSelf) {
        // The folder left the bin: it now lives at its original parent again.
        const target = this.state.folder?.recycleOriginalParent ?? this.state.account?.rootFolder;
        if (target) {
          // Force: the target's cached listing still misses the restored item.
          this.navigateTo({ id: target }, null, { force: true });
          return;
        }
      }
      this.reload();
    } catch (error) {
      busy.fail({ title: this.errorMessage(error, 'Could not restore') });
    } finally {
      this.pending = false;
    }
  }

  async emptyRecycleBin() {
    if (this.pending) return;
    const confirmed = await popup.confirm({
      title: 'Empty the recycle bin?',
      message: 'Every item in the recycle bin will be permanently deleted. This cannot be undone.',
      danger: true,
    });
    if (!confirmed) return;
    this.pending = true;
    const busy = toast.busy({ title: 'Emptying the recycle bin…' });
    try {
      await contents.emptyRecycleBin(this.state.account.token);
      busy.succeed({ title: 'Recycle bin emptied' });
      this.reload();
    } catch (error) {
      busy.fail({ title: this.errorMessage(error, 'Could not empty the recycle bin') });
    } finally {
      this.pending = false;
    }
  }

  async disableRecycleBin() {
    if (this.pending) return;
    const confirmed = await popup.confirm({
      title: 'Disable the recycle bin?',
      message: 'Future deletions will be permanent immediately. Items currently in the bin must all be older than 24 hours for this to succeed.',
      danger: true,
    });
    if (!confirmed) return;
    this.pending = true;
    const busy = toast.busy({ title: 'Disabling the recycle bin…' });
    try {
      await contents.removeRecycleBin(this.state.account.token);
      busy.succeed({ title: 'Recycle bin disabled' });
      // Drop the now-stale recycleFolder from the account store, so the
      // sidebar menu stops pointing at a bin that no longer exists.
      await refreshActiveAccount({ force: true }).catch(() => {}); // syncError is flagged on failure
      // The router re-mounts a fresh manager whose load() consults the
      // listing cache — invalidate it like every other mutation follow-up.
      invalidateListingCache();
      navigate('/myfiles');
    } catch (error) {
      if (error instanceof ApiError && error.apiStatus === 'error-recycleHasRecentItems') {
        busy.dismiss();
        popup.alert({ title: 'Bin still has recent items', message: 'Items deleted less than 24 hours ago are still in the bin. Empty it or wait, then try again.' });
      } else {
        busy.fail({ title: this.errorMessage(error, 'Could not disable the recycle bin') });
      }
    } finally {
      this.pending = false;
    }
  }

  setClipboard(op, items) {
    if (op === null) {
      this.state.clipboard = null;
      localStorage.removeItem(CLIPBOARD_STORAGE_KEY);
      this.renderToolbar();
      return;
    }
    if (!items?.length) return;
    if (this.state.account?.tier !== 'premium') return showPremiumUpsell('Copy & move between folders');
    this.state.clipboard = {
      op,
      ids: items.map((item) => item.id),
      names: items.slice(0, 3).map((item) => item.name),
      sourceFolderId: this.state.folderId,
      accountId: this.state.account.id,
      at: Date.now(),
    };
    localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(this.state.clipboard));
    this.clearSelection();
    this.renderToolbar();
    toast({
      title: `${items.length} item${items.length > 1 ? 's' : ''} ready to ${op}`,
      message: isCoarsePointer()
        ? 'Open the destination folder, then tap the clipboard button to paste.'
        : `Open the destination folder, then paste (${modHint('V')} or the clipboard button).`,
      type: 'info',
    });
  }

  async pasteClipboard() {
    const clipboard = this.state.clipboard;
    if (!clipboard) return;
    if (clipboard.accountId !== this.state.account?.id) {
      toast.error('Switch back to the account that owns these items to paste them.');
      return;
    }
    if (clipboard.ids.includes(this.state.folderId)) {
      toast.error('A folder cannot be pasted into itself.');
      return;
    }
    if (this.pending) return;
    this.pending = true;
    const verb = clipboard.op === 'move' ? 'Moving' : 'Copying';
    const busy = toast.busy({
      title: `${verb} ${clipboard.ids.length} item${clipboard.ids.length > 1 ? 's' : ''}…`,
    });
    try {
      const call = clipboard.op === 'move' ? contents.moveContents : contents.copyContents;
      await call(this.state.account.token, clipboard.ids, this.state.folderId);
      busy.succeed({
        title: `${clipboard.ids.length} item${clipboard.ids.length > 1 ? 's' : ''} ${clipboard.op === 'move' ? 'moved' : 'copied'}`,
      });
      this.setClipboard(null);
      this.reload();
    } catch (error) {
      if (contents.isPremiumRequired(error)) {
        busy.dismiss();
        showPremiumUpsell('Copy & move between folders');
      } else {
        busy.fail({ title: this.errorMessage(error, `Could not ${clipboard.op} the items`) });
      }
    } finally {
      this.pending = false;
    }
  }

  async importItems(items) {
    if (this.state.account?.tier !== 'premium') return showPremiumUpsell('Importing content');
    const confirmed = await popup.confirm({
      title: `Import ${items.length > 1 ? `${items.length} items` : `“${items[0].name}”`}?`,
      message: 'A copy will be added to the root of your own files. Frozen (cold storage) files become accessible again once imported.',
    });
    if (!confirmed || this.pending) return;
    this.pending = true;
    const busy = toast.busy({ title: 'Importing…' });
    try {
      await contents.importContents(
        this.state.account.token,
        items.map((item) => item.id),
        sessionStorage.getItem(`password|${this.params.contentId}`) ?? undefined
      );
      busy.succeed({
        title: 'Imported to your files',
        actions: [{ label: 'Open my files', href: '/myfiles' }],
      });
    } catch (error) {
      if (contents.isPremiumRequired(error)) {
        busy.dismiss();
        showPremiumUpsell('Importing content');
      } else {
        busy.fail({ title: this.errorMessage(error, 'Import failed') });
      }
    } finally {
      this.pending = false;
    }
  }

  /* Content-settings popups live in files/settings.js; they only rely on
   * this state's account, errorMessage() and reload(). */

  shareItem(item) {
    return openSharePopup(this, item);
  }

  manageAccess(folder) {
    return openAccessPopup(this, folder);
  }

  editDescription(folder) {
    return openDescriptionEditor(this, folder);
  }

  editTags(item) {
    return openTagsEditor(this, item);
  }

  manageDirectLinks(item) {
    return openDirectLinksManager(this, item);
  }

  reportAbuse() {
    return openReportPopup(this);
  }

  showProperties(item) {
    if (!item) return;
    const rows = [];
    const row = (label, value, { mono = false, copy = false } = {}) => {
      if (value === undefined || value === null || value === '') return;
      rows.push(`
        <div class="flex items-start justify-between gap-3 py-1.5">
          <span class="shrink-0 text-xs font-medium text-slate-500">${label}</span>
          <span class="flex min-w-0 items-center gap-1.5 text-right text-xs text-slate-200">
            <span class="break-all ${mono ? 'font-mono' : ''}">${escapeHtml(String(value))}</span>
            ${copy ? `<button type="button" class="icon-btn !size-6 shrink-0" data-copy="${escapeHtml(String(value))}" aria-label="Copy ${label}">${icon('copy', 'size-3')}</button>` : ''}
          </span>
        </div>`);
    };

    row('Name', item.name);
    row('Type', item.type === 'folder' ? 'Folder' : item.mimetype || 'File');
    row('ID', item.id, { mono: true, copy: true });
    if (item.code) row('Share code', item.code, { mono: true, copy: true });
    row('Created', formatDateTime(item.createTime));
    if (item.modTime && item.modTime !== item.createTime) row('Modified', formatDateTime(item.modTime));
    if (item.type === 'file') {
      row('Size', `${formatBytes(item.size)} (${formatCount(item.size)} bytes)`);
      if (item.isOwner) row('Downloads', formatCount(item.downloadCount ?? 0));
      if (item.md5) row('MD5', item.md5, { mono: true, copy: true });
      if (Array.isArray(item.servers) && item.servers.length) row('Stored on', item.servers.join(', '), { mono: true });
      if (item.isFrozen) row('Cold storage', item.isFrozenTimestamp ? `since ${formatDateTime(item.isFrozenTimestamp)}` : 'yes');
    } else {
      row('Items', formatCount(item.childrenCount ?? 0));
      // No "Total size" for folders: the API sums it over the current page's
      // children only, so the number would be page-local, not a real total.
      row('Visibility', item.public ? 'Public' : 'Private');
      if (item.password) row('Password', 'protected');
      if (item.expire) row('Expires', formatDateTime(item.expire));
      if (item.recycleDeletedAt) row('Removed', formatDateTime(item.recycleDeletedAt));
    }
    // Shared metadata (folders and files alike — tags included: the listing
    // returns them for files too).
    const tags = Array.isArray(item.tags) ? item.tags.join(', ') : item.tags;
    if (tags) row('Tags', tags);
    const directLinkCount = item.isOwner && item.directLinks ? Object.keys(item.directLinks).length : 0;
    if (directLinkCount) row('Direct links', formatCount(directLinkCount));

    popup.open({
      title: 'Properties',
      content: `<div class="divide-y divide-white/5">${rows.join('')}</div>`,
      onOpen: (body) => {
        body.addEventListener('click', async (event) => {
          const button = event.target.closest('[data-copy]');
          if (!button) return;
          try {
            await navigator.clipboard.writeText(button.dataset.copy);
            toast.success('Copied');
          } catch { /* clipboard unavailable */ }
        });
      },
    });
  }

  openSearch() {
    if (this.state.account?.tier !== 'premium') return showPremiumUpsell('Search');

    const renderResults = (container, results) => {
      const entries = Object.values(results ?? {});
      if (entries.length === 0) {
        container.innerHTML = `<p class="py-6 text-center text-xs text-slate-500">No results.</p>`;
        return;
      }
      container.innerHTML = entries.map((entry) => `
        <button type="button" data-result-id="${escapeHtml(entry.id)}" data-result-parent="${escapeHtml(entry.parentFolder ?? '')}" data-result-type="${entry.type}" data-result-name="${escapeHtml(entry.name)}"
                class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5">
          ${icon(entry.type === 'folder' ? 'folder' : 'file', `size-4 shrink-0 ${entry.type === 'folder' ? 'text-amber-400' : 'text-slate-400'}`)}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm text-white">${escapeHtml(entry.name)}</span>
            <span class="block text-xs text-slate-500">${entry.type === 'folder' ? `${formatCount(entry.childrenCount ?? 0)} items` : formatBytes(entry.size)} · ${formatDateTime(entry.createTime)}</span>
          </span>
          ${icon('chevron-right', 'size-4 shrink-0 text-slate-600')}
        </button>`).join('');
      refreshIcons();
    };

    popup.open({
      title: 'Search in this folder',
      size: 'lg',
      content: `
        <form data-search-form class="flex items-center gap-2">
          <input type="search" name="q" required minlength="2" placeholder="Name or tag…" class="input" autocomplete="off" />
          <button type="submit" class="btn-primary !px-3 !py-2 text-xs">${icon('search', 'size-4')} Search</button>
        </form>
        <div data-search-results class="mt-3 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-white/5 bg-surface-base/40 p-1.5">
          <p class="py-6 text-center text-xs text-slate-500">Results appear here — the search covers this folder and everything inside it.</p>
        </div>`,
      initialFocus: 'input[name=q]',
      onOpen: (body, handle) => {
        const form = body.querySelector('[data-search-form]');
        const results = body.querySelector('[data-search-results]');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const q = form.elements.q.value.trim();
          if (q.length < 2) return;
          results.innerHTML = `<p class="py-6 text-center text-xs text-slate-500">${icon('loader-circle', 'size-4 animate-spin')} Searching…</p>`;
          refreshIcons();
          try {
            const data = await contents.searchContents(this.state.account.token, {
              contentId: this.state.folderId,
              searchedString: q,
            });
            renderResults(results, data);
          } catch (error) {
            results.innerHTML = `<p class="py-6 text-center text-xs text-red-400">${escapeHtml(this.errorMessage(error, 'Search failed'))}</p>`;
          }
        });
        results.addEventListener('click', (event) => {
          const button = event.target.closest('[data-result-id]');
          if (!button) return;
          handle.close();
          if (button.dataset.resultType === 'folder') {
            this.navigateTo({ id: button.dataset.resultId });
            return;
          }
          // File result: land on its folder with the filter pre-set on the
          // file name, so the file stays findable even among thousands of
          // siblings. Already in that folder? Filter in place — navigating
          // would just reload the folder we're looking at.
          const parent = button.dataset.resultParent;
          if (!parent) return;
          const name = button.dataset.resultName ?? '';
          if (parent === this.state.folderId) this.applyFilter(name);
          else this.navigateTo({ id: parent }, null, { filter: name });
        });
      },
    });
  }

  async unlockFolder(plainPassword) {
    const hash = await sha256Hex(plainPassword);
    // Keyed by the CURRENT URL identifier (uuid or share code); the entry is
    // re-keyed if canonicalization later swaps it.
    sessionStorage.setItem(`password|${this.params.contentId}`, hash);
    await this.load({ force: true });
  }

  errorMessage(error, fallback) {
    if (error instanceof ApiError) {
      if (error.kind === 'rateLimit') return 'Rate limit reached — wait a few seconds and retry.';
      if (error.apiStatus && error.apiStatus !== 'error-noResponse') return `${fallback} (${error.apiStatus})`;
    }
    return fallback;
  }
}
