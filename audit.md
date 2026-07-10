## Kesimpulan audit

Dokumentasinya sudah punya **kerangka yang bagus**, tetapi belum aman dijadikan *source of truth*. Masalah terbesarnya bukan sekadar ada modul yang belum dijelaskan, melainkan ada beberapa instruksi yang sudah bertentangan dengan implementasi terbaru.

`TODO.md` terbaru sudah terisi dan item UI dari audit sebelumnya sudah masuk. Bagian **Framework Hardening** saat ini cukup bagus sebagai awal, tetapi masih terlalu berfokus pada pemindahan file, storage, fast capture, add-on API, dan UI. Hardening lifecycle, route transition, cancellation, registry collision, testing, dan automation belum tercakup. ([GitHub][1])

---

# Yang terlewat atau perlu diperbaiki di dokumentasi

## 1. Instruksi registrasi feature — Selesai

Instruksi manual untuk mendaftarkan feature telah diperbaiki. Panduan sekarang menjelaskan alur manifest-generator:

- export `*Feature` dari module feature
- jalankan `scripts/featureManifest.cjs` untuk menghasilkan manifest
- loader menggunakan manifest ter-generate untuk registrasi runtime

File yang diperbarui: `docs/features/creating-features.md`, `docs/features/index.md`.

## 1. Instruksi registrasi feature — Selesai

Perincian tugas yang diselesaikan dipindahkan ke `finish-audit.md`.

---


## Status update — items moved to `finish-audit.md`

Several documentation tasks have been completed and their detailed change logs are consolidated in `finish-audit.md`. Completed items include:

- Feature registration documentation updated to use the generated manifest workflow.
- `docs/features/index.md` synchronized to reference the generated manifest.
- Add-on documentation fixes (event name, example path sanitization).
- Added `scripts/validate-manifest.js` and `package.json` script `validate:manifest`.
- Core docs: `docs/core/lifecycle.md`, `docs/core/registries.md`, `docs/core/routing-and-scopes.md` created/expanded.
- `docs/core/teardown.md` expanded with teardown ordering and BFCache guidance.
- CI workflow added: `.github/workflows/validate-manifest.yml` to run the validator on push/PR.

See `finish-audit.md` for full details and file-by-file changes.

---

# Dokumen tambahan yang paling berguna

Tidak perlu membuat dokumentasi per file. Struktur berikut sudah cukup:

```text
docs/
├── lifecycle.md
├── build-and-release.md
├── testing.md
├── security.md
├── observability.md
├── config/
│   └── schema-and-migrations.md
├── core/
│   ├── registries.md
│   ├── routing-and-scopes.md
│   └── scheduling.md
└── services/
    ├── settings-and-sync.md
    ├── tags-and-safety.md
    └── addon-runtime.md
```

Prioritas tertinggi adalah:

1. `lifecycle.md`
2. `config/schema-and-migrations.md`
3. `security.md`
4. `testing.md`
5. `build-and-release.md`

---


## Remaining actionable TODOs

The detailed framework hardening checklist has been moved to `finish-audit.md` and `TODO.md` for triage and assignment. Please review those files for the full task list.

---

# TODO yang sekarang sebaiknya dirapikan

Bagian awal seperti:

* create `docs/`;
* initialize README;
* document core;
* write agent guide;

sudah bukan “Next Steps” lagi karena file-file itu sudah ada. Pindahkan ke **Completed**, atau ubah menjadi tugas yang bisa diverifikasi, misalnya:

```text
- [ ] Bring core documentation coverage to the current source inventory.
- [ ] Remove stale instructions that conflict with AGENTS.md.
- [ ] Add automated documentation drift checks.
```

Selain itu:

```text
Move dom.js
Move tasksRegistry.js
Decouple fast capture
```

belum otomatis berarti hardening. Pemindahan file cuma reorganisasi. Ubah TODO menjadi berbasis hasil:

```text
- [ ] Define ownership and public API boundaries for DOM utilities.
- [ ] Define scheduling ownership between taskQueue, tasksRegistry, and frameBudget.
- [ ] Isolate fast capture behind a documented service interface with lifecycle,
      cleanup, payload limits, and tests.
```

---

# Urutan pengerjaan yang paling masuk akal

1. Perbaiki dokumentasi registrasi feature yang salah.
2. Tambahkan manifest/schema validation.
3. Harden lifecycle cancellation dan route generation.
4. Tentukan teardown/BFCache contract.
5. Harden settings migration dan cross-tab sync.
6. Formalisasi add-on security protocol.
7. Tambahkan integration tests dan CI drift checks.
8. Baru lakukan pemindahan file atau reorganisasi folder.

Satu tambahan repo hygiene: `package.json` menyatakan lisensi `ISC`, sedangkan repository menampilkan lisensi MIT. `package.json` juga masih memiliki script `build:framework` menuju `framework/build.js`, sementara folder `framework` tidak terlihat di root branch saat ini; keduanya layak dimasukkan sebagai tugas verifikasi metadata/build scripts. ([GitHub][12])

Audit ini bersifat **static review terhadap branch `main` terbaru**; aku tidak menjalankan build atau test suite.

[1]: https://github.com/Zenix-Al/f95-zone-highlighter/blob/main/TODO.md "f95-zone-highlighter/TODO.md at main · Zenix-Al/f95-zone-highlighter · GitHub"
[2]: https://github.com/Zenix-Al/f95-zone-highlighter/raw/refs/heads/main/docs/features/creating-features.md "raw.githubusercontent.com"
[3]: https://github.com/Zenix-Al/f95-zone-highlighter/raw/refs/heads/main/docs/features/index.md "raw.githubusercontent.com"
[4]: https://github.com/Zenix-Al/f95-zone-highlighter/raw/refs/heads/main/docs/core/index.md "raw.githubusercontent.com"
[5]: https://github.com/Zenix-Al/f95-zone-highlighter/raw/refs/heads/main/docs/services/index.md "raw.githubusercontent.com"
[6]: https://github.com/Zenix-Al/f95-zone-highlighter/raw/refs/heads/main/docs/config/index.md "raw.githubusercontent.com"
[7]: https://github.com/Zenix-Al/f95-zone-highlighter/raw/refs/heads/main/docs/services/addonsService.md "raw.githubusercontent.com"
[8]: https://github.com/Zenix-Al/f95-zone-highlighter/blob/main/docs/architecture.md "f95-zone-highlighter/docs/architecture.md at main · Zenix-Al/f95-zone-highlighter · GitHub"
[9]: https://raw.githubusercontent.com/Zenix-Al/f95-zone-highlighter/refs/heads/main/docs/README.md "raw.githubusercontent.com"
[10]: https://github.com/Zenix-Al/f95-zone-highlighter/blob/main/src/core/featureCatalog.js "f95-zone-highlighter/src/core/featureCatalog.js at main · Zenix-Al/f95-zone-highlighter · GitHub"
[11]: https://github.com/Zenix-Al/f95-zone-highlighter/blob/main/src/core/listenerRegistry.js "f95-zone-highlighter/src/core/listenerRegistry.js at main · Zenix-Al/f95-zone-highlighter · GitHub"
[12]: https://github.com/Zenix-Al/f95-zone-highlighter/blob/main/package.json "f95-zone-highlighter/package.json at main · Zenix-Al/f95-zone-highlighter · GitHub"
