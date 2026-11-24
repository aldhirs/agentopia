# Memasang Agentopia

Untuk Mac dengan chip Apple (M1/M2/M3/M4). App ini dipakai internal, jadi **tidak ditandatangani Apple**;
macOS akan menahannya saat pertama dibuka. Ikuti langkah di bawah sekali saja.

## Prasyarat

1. **Claude Code terpasang dan sudah login** di Mac kamu. Cek di Terminal:
   ```bash
   claude auth status
   ```
   Harus menampilkan `"loggedIn": true`. Kalau belum, jalankan `claude` lalu ketik `/login`.
2. Agentopia memakai login itu: **tidak perlu API key**, pemakaian masuk ke kuota langganan Claude kamu.

## Pasang

1. Buka file `Agentopia-<versi>-arm64.dmg`.
2. Seret **Agentopia** ke folder **Applications**.
3. Buka Terminal dan jalankan (menghapus tanda karantina dari file yang diunduh):
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Agentopia.app"
   ```
4. Buka **Agentopia** dari Launchpad atau Applications.

Alternatif tanpa Terminal: buka app sekali (akan ditolak), lalu buka **System Settings → Privacy & Security**,
gulir ke bawah, klik **Open Anyway** untuk Agentopia, dan konfirmasi.

## Windows (x64) — eksperimental

> Installer Windows dibuat dari Mac dan **belum pernah diuji di mesin Windows**. Laporkan bila ada masalah.

1. Pasang Claude Code versi Windows (native) dan login: jalankan `claude` di PowerShell lalu `/login`.
   Cek dengan `claude auth status`.
2. Jalankan `Agentopia-Setup-<versi>-x64.exe`. Karena installer tidak ditandatangani, Windows SmartScreen
   akan menampilkan peringatan: klik **More info → Run anyway**.
3. Pilih folder instalasi (default: per pengguna), selesai. Shortcut **Agentopia** dibuat di desktop dan Start menu.
4. Butuh Windows 10 versi 1809 atau lebih baru (untuk ConPTY).

## Pemakaian singkat

- **Lobby**: pilih folder project, (opsional) tulis tugas awal, pilih mode izin, klik **Mulai sesi & masuk kantor**.
- Folder yang belum pernah dibuka dengan Claude Code akan menanyakan *“Do you trust this folder?”* di jendela
  **Terminal** di dalam app. Pilih *Yes, I trust this folder*.
- Di kantor: klik karakter untuk melihat detailnya; jendela Terminal dan detail bisa di-drag, minimize, maximize.
- Lead bergerak di ruangannya sesuai yang sedang dikerjakan: ke rak buku saat membaca kode, ke rak server saat
  menjalankan perintah, ke papan saat menyusun daftar tugas, memegang ponsel saat mencari di web, dan melambai di
  kaca depan saat menunggu kamu. Daftar tugas Lead juga tampil di papan dan di kartu sesi (klik untuk melihat semua).
- Tiga staf kantor (NPC) mengisi kantor 3D: ngopi di coffee bar, menyiram tanaman, main billiard, dan melihat ke
  jendela. Mereka bersorak saat Lead selesai. Mereka hanya hiasan (tanpa label, tidak bisa diklik) dan bisa
  dimatikan di Pengaturan → Tampilan → Staf kantor.
- **Project sebelumnya** di lobby bisa dilanjutkan dengan tombol **Lanjutkan** (percakapan terakhir di folder itu).
- **Tambah agent**: klik **+ Tambah agent** di daftar tim lobby (atau **+ Agent baru** di kantor). Isi nama, kapan dipakai,
  instruksi dan model, lalu pilih disimpan untuk project ini (`<folder>/.claude/agents`) atau semua project (`~/.claude/agents`).
- **Ngobrol langsung dengan satu agent**: di lobby pilih agent di **Ngobrol dengan** (atau klik namanya di daftar tim).
  Sesi dimulai dengan agent itu sebagai lawan bicara utama (`claude --agent <nama>`).
- **Tanya agent dari kantor**: klik **Tanya agent** di kartu sesi (atau **Tanya <agent>** di detail subagent).
  *Tanya di sesi ini* mengirim `@agent-<nama> <pertanyaan>` ke sesi: Lead memanggil agent itu dan jawabannya muncul di
  terminal. *Chat terpisah* membuka kantor baru untuk ngobrol langsung dengan agent itu, dengan konteks sendiri.
- **Argumen tambahan** di form menerima flag `claude` seperti di terminal, mis. `--chrome --continue`
  (`--continue` melanjutkan percakapan terakhir di folder itu, termasuk yang dimulai dari terminal biasa).
  Argumen terakhir per folder diingat otomatis.
- Saat pertama ada agent minta izin, macOS menanyakan izin notifikasi untuk Agentopia. Izinkan supaya kamu
  diberi tahu walau app sedang tidak dibuka. Bisa dimatikan di **Pengaturan** (ikon roda gigi di lobby).

## Masalah umum

| Gejala | Solusi |
|---|---|
| Lobby menulis “Claude Code tidak ditemukan” | Pasang Claude Code, pastikan `claude --version` jalan di Terminal, lalu buka ulang app |
| Lobby menulis “belum login” | Jalankan `claude` di Terminal, ketik `/login`, lalu buka ulang app |
| “Agentopia is damaged / can’t be opened” | Jalankan perintah `xattr` di langkah 3 |
| Sesi tidak mulai, terminal menanyakan trust folder | Jawab di jendela Terminal app (panah bawah → Enter) |
| Sesi langsung berhenti / error lain | Kirim file log: macOS `~/Library/Application Support/Agentopia/logs/main.log`, Windows `%APPDATA%\Agentopia\logs\main.log` (berisi perintah yang dijalankan dan pesan error saat start, tanpa token) |
