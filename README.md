# Virtual Office

Aplikasi desktop (Electron + Vue) yang menjalankan sesi Claude Code dan menampilkannya sebagai kantor virtual:
Lead (sesi utama) dan subagent jadi karakter yang bergerak sesuai aktivitasnya.

Memakai login Claude Code yang sudah ada di komputer (tanpa API key).

## Menjalankan (development)

Prasyarat: Node 20+, Claude Code terpasang dan sudah login (`claude auth status`).

```bash
npm install
npm run dev        # buka app dengan hot reload
npm test           # unit test
VO_E2E=1 npm test  # + uji end-to-end dengan sesi claude asli (memakai sedikit kuota)
```

Dokumen: [rencana pengembangan](docs/DEVELOPMENT_PLAN.md) · [catatan spike Phase 0](docs/spike-notes.md)
