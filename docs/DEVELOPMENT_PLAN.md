# Virtual Office — Development Plan

Status: draft v2 · 18 Nov 2026
Desain acuan: canvas "Virtual Office Agents" (Lobby, Sesi, Status karakter)

Keputusan:
- **v1 fokus macOS (`.dmg`).** Windows (`.exe`) ditunda ke Phase 7 karena belum ada mesin Windows untuk uji.
  Arsitektur tetap dijaga agar bisa di-port (lihat §3).
- **Pemakaian: pribadi + tim internal.** Tidak perlu Apple Developer Program untuk v1; DMG tanpa signing.
- **Repo: GitHub pribadi.** CI pakai GitHub Actions (runner macOS).

## 1. Tujuan

Aplikasi desktop (v1: macOS `.dmg`; nanti Windows `.exe`) yang menjalankan sesi Claude Code
dan memvisualisasikannya sebagai kantor virtual:

- **1 sesi Claude Code = 1 kantor.** Lead = sesi utama, subagent = karakter yang dipanggil Lead.
- Karakter bergerak sesuai aktivitas nyata (berpikir, memakai tool, minta izin, error, selesai).
- Terminal Claude Code asli tampil sebagai jendela overlay (bisa minimize, maximize, drag).
- Memakai login Claude Code yang sudah ada di komputer pemakai, **tanpa API key** dan tanpa langganan tambahan.

### Di luar lingkup v1
- Menempel ke sesi `claude` yang dibuka dari terminal lain (hanya sesi yang dijalankan dari app).
- Multi-user / akses jaringan. App hanya listen di `127.0.0.1`.
- Windows build (Phase 7) dan Linux build (bisa ditambahkan nanti, stack-nya sama).
- Code signing / notarization (hanya dibutuhkan jika app dibagikan di luar tim).

## 2. Keputusan arsitektur

| Area | Pilihan | Alasan |
|---|---|---|
| Shell aplikasi | **Electron** + electron-builder | Satu codebase untuk `.dmg` dan `.exe`; backend Node berjalan di main process |
| UI | **Vue 3 + Vite + TypeScript** | Sesuai stack tim; animasi pakai CSS (sudah terbukti di desain) |
| Terminal | **node-pty** (macOS: pty, Windows: ConPTY) + **xterm.js** | Menampilkan TUI Claude Code asli dan bisa diketik |
| Sumber status karakter | **Hooks Claude Code**, disuntikkan per sesi lewat `claude --settings <json>` | Tidak mengubah `~/.claude/settings.json` pemakai |
| Cadangan sumber status | Membaca transcript JSONL sesi di folder `~/.claude/projects/` | Dipakai jika data hooks tidak cukup (mis. tidak bisa membedakan subagent) |
| Main ↔ UI | Electron IPC (contextBridge, `contextIsolation: true`) | Renderer tidak punya akses Node langsung |
| Penerima hooks | HTTP server di `127.0.0.1`, port acak, token per sesi | Aman; hanya proses lokal dengan token yang bisa mengirim event |
| Penyimpanan app | JSON di folder data app (`app.getPath('userData')`) | Daftar sesi, preferensi; tanpa database |

```
┌──────────────── Electron app ────────────────┐
│ Renderer (Vue)                                │
│  Lobby · Office · Terminal (xterm) · Detail   │
│            ▲ IPC (event, output pty)          │
│ Main process (Node)                           │
│  SessionManager ── node-pty ──▶ claude (TUI)  │
│  HookReceiver (127.0.0.1:port, token) ◀─ hooks│
│  TranscriptWatcher (cadangan)                 │
│  StateStore: sesi → agent → status            │
└───────────────────────────────────────────────┘
```

### Model data inti
- **Session**: id, nama, folder, mode izin, model, worktree, `claude` session id, status proses.
- **Agent**: id (Lead atau instance subagent), tipe (`backend-engineer`, `Explore`, …), nama tampilan,
  warna, status (`idle | thinking | tool_use | waiting | error | done`), aktivitas terakhir, log.
- **Event**: `{ sessionId, agentId, kind, tool?, input?, result?, ts }` hasil normalisasi dari hooks/transcript.

### Tim dinamis (hot desk)
- Tipe agent yang tersedia dibaca dari `~/.claude/agents/`, `<project>/.claude/agents/`, plus agent bawaan.
- Meja di kantor dibuat saat subagent dipanggil; dua instance tipe yang sama = dua karakter.
- Tipe yang tidak dikenal tetap tampil: warna dan label dibuat otomatis dari namanya.

## 3. Target platform

| | macOS (v1) | Windows (Phase 7) |
|---|---|---|
| Output | `.dmg` (arm64; x64 opsional) | `.exe` installer NSIS (x64) |
| Lokasi `claude` | `~/.local/bin/claude`, Homebrew, npm global | `%USERPROFILE%\.local\bin\claude.exe`, npm global (`claude.cmd`) |
| PTY | pty bawaan | ConPTY (Windows 10 1809+) |
| Build | GitHub Actions runner macOS (atau lokal) | runner Windows (node-pty native, tidak di-cross-compile) |
| Tanpa signing | Gatekeeper: klik kanan → Open | SmartScreen: "More info → Run anyway" |
| Signing (opsional) | Apple Developer Program + notarization | Sertifikat code signing (OV/EV) |

Prasyarat di komputer pemakai: Claude Code terpasang dan sudah login.

Distribusi ke tim internal (DMG tanpa signing): setelah drag ke Applications, buka pertama kali
dengan klik kanan → Open, atau jalankan `xattr -dr com.apple.quarantine "/Applications/Virtual Office.app"`.

Aturan agar port ke Windows nanti murah:
- Semua path lewat `path`/`os.homedir()`, tidak ada path Unix yang di-hardcode.
- Perintah hook tidak bergantung pada shell/utilitas Unix (`curl`, `bash`); pakai helper Node yang dibawa app.
- Logika khusus OS dikumpulkan di satu modul (`ClaudeLocator`, packaging).

## 4. Struktur folder (rencana)

```
simple-virtual-office/
├─ docs/                     # plan, catatan spike, keputusan teknis
├─ electron/
│  ├─ main.ts                # window, IPC, lifecycle
│  ├─ preload.ts             # API aman untuk renderer
│  ├─ session/               # SessionManager, ClaudeLocator, pty
│  ├─ hooks/                 # HookReceiver, settings injector, helper hook
│  ├─ transcript/            # TranscriptWatcher (cadangan)
│  └─ state/                 # StateStore, normalisasi event
├─ src/                      # renderer Vue
│  ├─ pages/                 # Lobby, Office
│  ├─ components/            # Character, Desk, Window, Terminal, DetailCard
│  └─ stores/                # state UI (Pinia)
├─ build/                    # ikon, konfigurasi electron-builder
└─ .github/workflows/        # build dmg + exe
```

## 5. Phase

Ukuran: S = kecil, M = sedang, L = besar (relatif, bukan estimasi hari).

### Phase 0: Spike validasi · M
Tujuan: membuktikan bagian paling berisiko sebelum membangun app.

- [x] Spawn `claude` interaktif di node-pty (macOS). Tampilan di xterm.js dipindah ke Phase 2.
- [x] Pastikan login langganan terpakai: env `ANTHROPIC_API_KEY` dihapus saat spawn.
- [x] Suntikkan hooks lewat `--settings` dan rekam semua payload ke file:
      `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `SubagentStop`, `Stop`
      (plus hook terkait subagent/izin lain yang tersedia di versi terpasang).
- [x] **Pertanyaan kunci:** apakah event dari subagent bisa dibedakan per instance saat beberapa jalan paralel?
- [ ] Bandingkan isi transcript JSONL secara rinci → cukup diketahui lokasinya (`agent_transcript_path`); detail dikerjakan saat Phase 3 butuh teks laporan.
- [x] Tentukan cara hook mengirim event tanpa bergantung pada utilitas Unix
      (opsi: hook tipe HTTP jika didukung · helper Node yang dibawa app · tail transcript).

**Status: selesai (18 Nov 2026)** — hasil di `docs/spike-notes.md`. Sumber event: HTTP hooks via `--settings`.

Selesai jika: ada `docs/spike-notes.md` berisi contoh payload asli, jawaban pertanyaan kunci, dan
keputusan final sumber event.

### Phase 1: Fondasi app · M
- [x] Scaffold Electron 45 + electron-vite + Vue 3 + TS (typecheck `npm run typecheck`, test `npm test`).
- [ ] Lint + format (ESLint/Prettier) — belum dipasang.
- [x] `ClaudeLocator`: cari binary `claude` (macOS; jalur Windows sudah disiapkan, belum diuji) + cek login via `claude auth status`.
- [x] PATH login shell untuk app yang dibuka dari Finder (`shellEnv.ts`).
- [x] `SessionManager`: start, stop, satu proses pty per sesi. Resume (`--resume`) sudah ada di kode, **belum diuji**.
- [x] `HookReceiver` di `127.0.0.1` (port acak, token per sesi, HTTP hooks via `--settings`).
- [x] Reducer event → state kantor (`electron/state/reducer.ts`), diuji dengan rekaman spike.
- [x] Pengiriman state, efek, hook mentah, dan output pty ke renderer lewat IPC.
- [x] UI debug sementara (`src/App.vue`).

**Status: selesai (18 Nov 2026)** kecuali lint/format.
Bukti: `npm test` (15 unit test) dan `VO_E2E=1 npm test` (sesi `claude` asli + 1 subagent) lolos; app terbuka tanpa error.
Catatan: folder yang belum dipercaya memunculkan layar *workspace trust* di terminal; sesi baru jalan setelah dijawab.

Selesai jika: dari UI sederhana bisa start sesi, melihat event mentah mengalir, dan stop sesi.

### Phase 2: Terminal · M
- [x] Komponen `TerminalPane` (xterm.js 6): output, input keyboard, resize ke pty, warna, Unicode 11, link bisa diklik, Cmd+C untuk menyalin seleksi.
- [x] Riwayat output disimpan di main process, jadi terminal yang dibuka ulang menampilkan isi sebelumnya.
- [x] Komponen `OverlayWindow`: minimize ke dock, maximize/restore (juga dobel-klik header), drag lewat header, jendela terakhir disentuh naik ke depan.
- [x] Tab "Log terstruktur" dengan filter per agent (`shared/logFormat.ts`, diuji dengan rekaman spike).
- [x] Variabel environment sesi Claude Code induk tidak lagi terbawa ke `claude` yang dijalankan app
      (sebelumnya membuat transcript tidak tersimpan saat app dijalankan dari dalam Claude Code).
- [x] Lobby sementara (`DevLobby.vue`) untuk memulai/masuk sesi; diganti Lobby final di Phase 4.

**Status: selesai (18 Nov 2026).** Bukti: `scripts/smoke.cjs` membuka app, memulai sesi asli lewat form,
dan menyimpan screenshot terminal, log, maximize, minimize/dock, dan drag (event mouse asli).
Belum diuji manual oleh user: copy/paste, slash command, menjawab izin di terminal.

Selesai jika: sesi Claude Code bisa dipakai penuh dari dalam app (prompt, izin, slash command) seperti di terminal biasa.

### Phase 3: Virtual office · L
- [x] Lantai kantor (Ruang lead, area kerja, pantry, papan tugas) yang menyesuaikan ukuran layar (`OfficeFloor.vue`).
- [x] Karakter + status animasi dari desain (`CharacterBlob.vue`), plus status Lead "Menunggu subagent" dan "Menunggu kamu";
      semua animasi berhenti bila sistem disetel *reduce motion*.
- [x] Hot desk dinamis (`src/lib/seats.ts`): meja muncul saat subagent dipanggil, posisi stabil, instance ganda
      (`Explore`, `Explore #2`), warna & badge otomatis untuk tipe baru. Jika meja penuh, subagent yang sudah selesai
      pindah ke pantry; jika tetap kurang, kantor bertambah baris.
- [x] Garis tugas (biru, Lead → subagent) dan laporan balik (hijau, subagent → Lead) dari efek reducer.
- [x] Papan tugas berisi deskripsi tugas subagent; tercoret saat selesai.
- [x] Kartu detail per karakter: menempel ke karakter, bisa drag/minimize/maximize, berisi tugas dari Lead,
      log aktivitas, dan peringatan izin.

**Status: selesai (18 Nov 2026).** Bukti (`scripts/smoke.cjs`, screenshot):
2 subagent Explore paralel → 2 meja + garis tugas + Lead "Menunggu subagent" + centang saat selesai;
`SMOKE_PERMISSION=1` → Lead "Minta izin" dengan tanda "!", dijawab lewat terminal, perintah berjalan, Lead "Selesai".
Belum terlihat di sesi nyata: status Error (tool gagal), pindah ke pantry, kantor bertambah baris (keduanya diuji di unit test).

Selesai jika: menjalankan tugas nyata yang memanggil ≥2 subagent paralel menghasilkan visual yang cocok dengan terminal.

### Phase 4: Lobby · M
- [x] Form mulai sesi: folder (dialog native + chip folder terakhir), nama, model, tugas awal, mode izin,
      worktree (hanya aktif untuk folder git), pratinjau perintah yang sama persis dengan yang dijalankan (`shared/claudeArgs.ts`).
- [x] Daftar sesi berjalan (status ringkas, avatar agent aktif, tombol Masuk).
- [x] Riwayat sesi tersimpan permanen (`userData/sessions.json`, `electron/state/history.ts`) dengan tombol Lanjutkan
      (`claude --resume`); melanjutkan sesi tetap memakai baris riwayat yang sama.
- [x] Deteksi tim per folder: agent bawaan + `~/.claude/agents` + `<folder>/.claude/agents` (`electron/session/team.ts`).
- [x] Status Claude Code di header (versi + login), dengan pesan jelas bila belum login / tidak ditemukan.

**Status: selesai (18 Nov 2026).** Bukti: unit test (claudeArgs, history, team); e2e `VO_E2E=1` — sesi diberi kata
"PELANGI", dihentikan, dilanjutkan dengan `--resume`, dan Claude menjawab "PELANGI"; smoke `SMOKE_LOBBY=1` (mulai sesi →
lobby menampilkan sesi berjalan → hentikan → muncul di riwayat → Lanjutkan → kantor dengan percakapan lama).
Batasan: kantor dari sesi yang dilanjutkan mulai kosong (subagent lama tidak digambar ulang); resume sesi yang memakai
`--worktree` belum diuji.

Selesai jika: alur Lobby → mulai sesi → kantor → kembali ke Lobby → masuk lagi berjalan tanpa kehilangan sesi.

### Phase 5: Packaging DMG · M
- [x] electron-builder (`electron-builder.yml`): `.dmg` macOS arm64, ikon app (`build/icon.png`, dibuat oleh
      `scripts/make-icon.cjs`), ad-hoc signing agar jalan di Apple Silicon.
- [x] node-pty dikeluarkan dari asar (`asarUnpack`); `spawn-helper` tetap executable di app hasil build.
- [x] Library yang di-bundle Vite dipindah ke devDependencies → paket app hanya berisi kode app + node-pty.
- [x] GitHub Actions (`.github/workflows/release.yml`, runner macOS arm64): typecheck, test, build DMG saat push tag `v*`,
      lampirkan ke GitHub Release. **Belum dijalankan** karena repo GitHub belum ada.
- [x] Panduan instalasi tim (`docs/INSTALL.md`), termasuk membuka app tanpa signing Apple.
- [ ] Uji instalasi bersih di Mac lain milik anggota tim.

**Status: selesai untuk Mac ini (18 Nov 2026).** Bukti: `npm run dist` menghasilkan `release/Virtual-Office-0.1.0-arm64.dmg`
(116 MB; isi: app + shortcut Applications); `codesign --verify` lolos; `scripts/test-packaged.mjs` membuka app hasil build
lewat `open` (PATH minimal seperti dari Finder), menemukan `claude` + login, menjalankan sesi asli dengan subagent, dan
menyimpan screenshot kantor. Simulasi file unduhan: Gatekeeper menolak app (sesuai dugaan, tanpa signing Apple); setelah
`xattr -dr com.apple.quarantine` app bisa dibuka.

Selesai jika: dmg hasil CI bisa dipasang dan menjalankan sesi di Mac yang tidak punya source code.

### Phase 6: Polish · M
- [x] Notifikasi macOS saat agent minta izin atau Lead selesai (hanya saat app tidak sedang difokuskan); klik notifikasi
      membuka kantor sesi itu. Badge Dock = jumlah agent yang menunggu izin (`electron/state/attention.ts`).
- [x] Konfirmasi saat keluar bila masih ada sesi berjalan; semua sesi dihentikan bersih (tidak ada proses `claude` tertinggal).
- [x] Banner "Sesi berhenti" di kantor (termasuk kode keluar bila crash) dengan tombol Lanjutkan sesi.
- [x] Lobby: tombol mulai nonaktif dengan alasan jelas bila Claude Code tidak ditemukan/belum login; tombol Cek ulang.
- [x] Pengaturan (`userData/settings.json`): lokasi `claude`, kurangi animasi, ukuran font terminal, notifikasi on/off.
- [x] ESLint (`npm run lint`) + dijalankan di CI. (Prettier tidak dipasang agar tidak memformat ulang seluruh kode.)
- [x] Port bentrok tidak mungkin terjadi: penerima hooks memakai port acak.
- [ ] Peringatan kuota: Claude Code tidak memberi data sisa kuota lewat hooks, jadi belum bisa dibuat.

**Status: selesai (18 Nov 2026).** Bukti: unit test notifikasi memakai rekaman asli (1 notifikasi izin, tanpa notifikasi
palsu saat Lead menunggu subagent) dan pengaturan; smoke `SMOKE_POLISH=1` (dialog pengaturan, hentikan sesi → banner →
lanjutkan); `scripts/test-packaged.mjs` pada DMG baru: sesi asli jalan, app keluar, 0 proses `claude` tertinggal.
Belum dilihat langsung: tampilan notifikasi macOS dan badge Dock (logikanya diuji, tampilannya bergantung izin notifikasi).

### Phase 8: Kantor 3D (startup) · L
- [x] Kantor 3D dengan three.js 0.170 (`src/office3d/`): dinding bata + neon, dua pod, Ruang Lead kaca,
      lesehan, bean bag, billiard, coffee bar.
- [x] Karakter manusia per peran + robot untuk agent bawaan; pose per status (mengetik, tangan di dagu,
      angkat tangan, pegang kepala, tangan ke atas); warna layar mengikuti status.
- [x] Hot desk 3D (`layout.ts`): pod → lesehan → bantal tambahan; agent selesai berjalan ke bean bag. Unit test.
- [x] Animasi kirim tugas/laporan berupa bola bercahaya di lintasan melengkung.
- [x] Klik karakter → kartu detail menempel ke karakter; daftar tim (tombol) untuk keyboard/screen reader.
- [x] Kamera: seret untuk memutar, scroll untuk zoom, dobel-klik untuk reset.
- [x] Pengaturan "Kantor 3D / 2D"; fallback otomatis ke 2D bila WebGL gagal; "Kurangi animasi" menghentikan render saat diam.
- [x] Uji performa (`docs/perf-report.md`) dan keamanan (`docs/security-report.md`).

**Status: selesai (18 Nov 2026).** Bukti: smoke test dev + `scripts/test-packaged.mjs` pada DMG (sesi asli,
subagent pindah ke bean bag, cek keamanan renderer), 57 unit test.

### Phase 7: Windows `.exe` (ditunda) · M
Dikerjakan saat ada mesin/VM Windows untuk uji.
- [ ] Spike pty (ConPTY) + hooks di Windows.
- [ ] `ClaudeLocator` untuk lokasi Windows.
- [ ] electron-builder NSIS `.exe`; tambah `windows-latest` ke matrix GitHub Actions.
- [ ] Uji instalasi bersih di Windows.

## 6. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Hooks tidak membedakan instance subagent paralel | Phase 0 menjawab ini; cadangan: transcript JSONL |
| Payload/nama hook berubah antar versi Claude Code | Normalisasi di satu modul; catat versi `claude` yang diuji; tampilkan peringatan versi |
| Perbedaan Windows (path, shell untuk hook command, ConPTY) | Aturan portabilitas di §3 sejak awal; spike Windows di Phase 7 |
| node-pty gagal build/terpasang | Prebuilt + rebuild di CI per OS; pin versi Electron dan node-pty |
| App GUI tidak mewarisi PATH shell | `ClaudeLocator` mencari lokasi umum + pengaturan path manual |
| Tanpa signing → peringatan Gatekeeper | Panduan instalasi untuk tim; signing hanya jika app dibagikan di luar tim |
| Kuota langganan cepat habis karena banyak sesi/subagent | Tampilkan jumlah sesi aktif; peringatan di Lobby |

## 7. Keputusan yang sudah diambil

| Pertanyaan | Jawaban |
|---|---|
| Ada mesin Windows untuk uji? | Belum → v1 fokus `.dmg`, Windows di Phase 7 |
| Siapa pemakainya? | Pribadi + tim internal → tanpa signing untuk v1 |
| Repo di mana? | GitHub pribadi → GitHub Actions |
