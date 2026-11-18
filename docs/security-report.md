# Laporan keamanan — Virtual Office v0.1 (dengan kantor 3D)

Tanggal: 18 Nov 2026 · Electron 45.3.4 · build `release/Virtual-Office-0.1.0-arm64.dmg`

## Model ancaman singkat

App ini menjalankan `claude` di laptop pemakai, dengan hak akses akun pemakai. Aset yang dilindungi:
kemampuan menjalankan perintah lewat sesi Claude Code, isi percakapan/riwayat, dan login Claude Code.
Penyerang yang dipertimbangkan:

1. **Halaman web berbahaya** di browser pemakai yang mencoba mengirim request ke server hooks lokal.
2. **Proses lain di mesin yang sama** (akun lain atau malware tanpa hak penuh) yang mencoba menyuntik event.
3. **Konten tak tepercaya yang tampil di app** (output tool, isi file, pesan agent) yang mencoba menjadi XSS di renderer.
4. **Renderer yang tersusupi** yang mencoba memakai IPC untuk lebih dari yang bisa dilakukan UI.

Di luar cakupan: malware yang sudah berjalan sebagai akun pemakai (ia sudah bisa menjalankan `claude` sendiri),
dan keamanan Claude Code itu sendiri.

## Hasil pengujian

| Area | Pengujian | Hasil |
|---|---|---|
| Dependensi runtime (yang ikut di DMG) | `npm audit --omit=dev` | **0 kerentanan** |
| Dependensi build/dev | `npm audit` | 21 temuan dari **2 advisory**: `picomatch` ReDoS (GHSA-fc5q-39xc-vjpf, high) dan `minimatch` DoS (GHSA-g3hv-75wg-m249, moderate), lewat vite, vitest, electron-builder, eslint. Belum ada versi perbaikan `picomatch` (terbaru 4.0.7 masih rentan). Tidak ikut di app; hanya memproses pola glob milik repo saat build. **Risiko diterima, pantau.** |
| Server hooks lokal | `tests/security.test.ts` (8 test) | Hanya listen di `127.0.0.1`; token salah/kosong/milik sesi lain → 401; request dari browser (header `Origin`) → 401 walau tokennya benar; `Host` asing (DNS rebinding) → 401; method/path lain → 401; body > 2 MB → 413; JSON rusak diabaikan; token tidak pernah muncul di argumen command line (`$VO_HOOK_TOKEN` dari env). Perbandingan token memakai `crypto.timingSafeEqual`. |
| Hooks dari Claude Code asli tetap diterima | `VO_E2E=1` e2e test | Lolos setelah pengerasan |
| Validasi IPC (main tidak percaya renderer) | `tests/security.test.ts` + uji runtime di app hasil build | Folder relatif/tidak ada, mode izin `bypassPermissions`, flag terlarang (`--settings`, `-p`, …), model/ID berbentuk path atau berisi karakter shell, `claudePath` relatif, data pty > 1 MB, ukuran terminal tidak masuk akal → **semua ditolak** |
| Isolasi renderer | Uji runtime di DMG (`scripts/test-packaged.mjs`) | `require`, `process`, `module`, `Buffer` = `undefined`; renderer hanya melihat `window.office` (26 fungsi spesifik) |
| Navigasi & jendela | Uji runtime di DMG | `location.href = 'https://…'` diblokir; `window.open` → `null` (link http/https dibuka di browser sistem); `<webview>` diblokir |
| Izin web | Kode (`setPermissionRequestHandler` / `setPermissionCheckHandler`) | Semua ditolak (kamera, mikrofon, lokasi, notifikasi web, …) |
| XSS | Pencarian kode | Tidak ada `v-html`, `innerHTML`, `eval`, `new Function`. Teks agent dirender sebagai teks (Vue) atau digambar ke canvas |
| CSP | Meta CSP di `index.html` | `script-src 'self'`, tanpa `unsafe-eval`. `style-src` masih `'unsafe-inline'` (dibutuhkan xterm.js yang menyuntik `<style>`) |
| Electron fuses | `electron-fuses read` pada app hasil build | `RunAsNode`, `NODE_OPTIONS`, `--inspect` **mati**; validasi integritas asar, `OnlyLoadAppFromAsar`, enkripsi cookie **nyala** |
| `webPreferences` | Kode | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` |
| Data tersimpan | `tests/security.test.ts` | `sessions.json` dan `settings.json` mode **0600** (hanya pemilik akun) |
| Rahasia | Kode + uji | Tidak ada API key; `ANTHROPIC_API_KEY` dihapus dari env `claude`; token hooks hanya di env proses anak |
| Proses yatim | Uji runtime di DMG | Setelah app keluar: **0** proses `claude` dari app |
| Tanda tangan | `codesign --verify --deep --strict` | Lolos (ad-hoc, sesuai keputusan pemakaian internal) |

## Pengerasan yang ditambahkan dalam putaran ini

- Penerima hooks: token dibandingkan secara timing-safe, tolak header `Origin`, pin header `Host` ke loopback.
- Main process: validasi semua input IPC (`electron/ipc/validate.ts`), blok navigasi keluar app dan `<webview>`,
  tolak semua permintaan izin web.
- File riwayat & pengaturan ditulis dengan mode 0600.
- Electron fuses lewat `electron-builder.yml`.

## Risiko yang tersisa (diterima / ditindaklanjuti)

| Risiko | Tingkat | Catatan |
|---|---|---|
| Advisory `picomatch`/`minimatch` di tools build | Rendah | Tidak ikut di app. Perbarui saat versi perbaikan rilis (`npm audit`). |
| App tidak ditandatangani Apple (ad-hoc) | Sedang untuk distribusi luas, rendah untuk tim | Pemakai harus menghapus karantina; tidak ada notarization. Perlu Developer ID bila dibagikan di luar tim. |
| `style-src 'unsafe-inline'` | Rendah | Tidak ada jalur injeksi HTML yang ditemukan; skrip tetap hanya dari app. |
| Renderer tersusupi bisa mengetik ke terminal sesi yang sedang berjalan | Inheren | Itu fungsi utama terminal. Dimitigasi oleh isolasi, CSP, dan tidak memuat konten remote. |
| Riwayat menyimpan prompt dan balasan terakhir dalam teks biasa | Rendah | Mode 0600; folder data app. Bisa dienkripsi dengan `safeStorage` bila dibutuhkan. |
| `--remote-debugging-port` tidak diblokir fuse | Rendah | Membutuhkan kemampuan menjalankan app dengan argumen sebagai akun pemakai (setara malware lokal, di luar cakupan). |

## Yang belum dijalankan

- **Electronegativity** (scanner keamanan Electron dari Doyensec): perintah `npx --yes @doyensec/electronegativity`
  ditolak oleh pengaman otomatis sesi Claude Code karena mengunduh dan menjalankan paket pihak ketiga. Checklist
  yang diperiksa scanner itu (contextIsolation, sandbox, nodeIntegration, CSP, navigasi, window.open, permission
  handler, webview, fuses) sudah diperiksa manual dan lewat uji runtime di atas. Untuk menjalankannya sendiri:
  `npx @doyensec/electronegativity -i electron`.
- Pentest manual oleh pihak ketiga.
