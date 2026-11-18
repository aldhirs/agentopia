# Agentopia

Aplikasi desktop (Electron + Vue) yang menjalankan sesi Claude Code dan menampilkannya sebagai kantor virtual:
Lead (sesi utama) dan subagent jadi karakter yang bergerak sesuai aktivitasnya.

Memakai login Claude Code yang sudah ada di komputer (tanpa API key).

🎬 **Video singkat (30 detik):** [media/hallo-agentopia.mp4](media/hallo-agentopia.mp4)

## Menjalankan (development)

Prasyarat: Node 20+, Claude Code terpasang dan sudah login (`claude auth status`).

```bash
npm install
npm run dev        # buka app dengan hot reload
npm test           # unit test
npm run lint       # ESLint
VO_E2E=1 npm test  # + uji end-to-end dengan sesi claude asli (memakai sedikit kuota)
```

## Build DMG (macOS arm64)

```bash
npm run dist                          # -> release/Agentopia-<versi>-arm64.dmg
node scripts/test-packaged.mjs        # uji app hasil build (dibuka via `open`, sesi claude asli)
```

Rilis otomatis: push tag `v*` ke GitHub → workflow `.github/workflows/release.yml` membangun DMG dan
melampirkannya ke GitHub Release. Panduan pasang untuk tim: [docs/INSTALL.md](docs/INSTALL.md).

Dokumen: [rencana pengembangan](docs/DEVELOPMENT_PLAN.md) · [catatan spike Phase 0](docs/spike-notes.md)

## Kontribusi

Branch `main` dilindungi: semua perubahan lewat pull request dan CI (lint, typecheck, test) harus lolos.
Laporan celah keamanan: lihat [SECURITY.md](SECURITY.md) (jangan lewat issue publik).

## Lisensi

[Apache License 2.0](LICENSE) © 2026 aldhirs
