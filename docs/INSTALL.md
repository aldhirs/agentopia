# Memasang Virtual Office (macOS)

Untuk Mac dengan chip Apple (M1/M2/M3/M4). App ini dipakai internal, jadi **tidak ditandatangani Apple**;
macOS akan menahannya saat pertama dibuka. Ikuti langkah di bawah sekali saja.

## Prasyarat

1. **Claude Code terpasang dan sudah login** di Mac kamu. Cek di Terminal:
   ```bash
   claude auth status
   ```
   Harus menampilkan `"loggedIn": true`. Kalau belum, jalankan `claude` lalu ketik `/login`.
2. Virtual Office memakai login itu: **tidak perlu API key**, pemakaian masuk ke kuota langganan Claude kamu.

## Pasang

1. Buka file `Virtual-Office-<versi>-arm64.dmg`.
2. Seret **Virtual Office** ke folder **Applications**.
3. Buka Terminal dan jalankan (menghapus tanda karantina dari file yang diunduh):
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Virtual Office.app"
   ```
4. Buka **Virtual Office** dari Launchpad atau Applications.

Alternatif tanpa Terminal: buka app sekali (akan ditolak), lalu buka **System Settings → Privacy & Security**,
gulir ke bawah, klik **Open Anyway** untuk Virtual Office, dan konfirmasi.

## Pemakaian singkat

- **Lobby**: pilih folder project, (opsional) tulis tugas awal, pilih mode izin, klik **Mulai sesi & masuk kantor**.
- Folder yang belum pernah dibuka dengan Claude Code akan menanyakan *“Do you trust this folder?”* di jendela
  **Terminal** di dalam app. Pilih *Yes, I trust this folder*.
- Di kantor: klik karakter untuk melihat detailnya; jendela Terminal dan detail bisa di-drag, minimize, maximize.
- **Sesi sebelumnya** di lobby bisa dilanjutkan dengan tombol **Lanjutkan**.
- **Argumen tambahan** di form menerima flag `claude` seperti di terminal, mis. `--chrome --continue`
  (`--continue` melanjutkan percakapan terakhir di folder itu, termasuk yang dimulai dari terminal biasa).
  Argumen terakhir per folder diingat otomatis.
- Saat pertama ada agent minta izin, macOS menanyakan izin notifikasi untuk Virtual Office. Izinkan supaya kamu
  diberi tahu walau app sedang tidak dibuka. Bisa dimatikan di **Pengaturan** (ikon roda gigi di lobby).

## Masalah umum

| Gejala | Solusi |
|---|---|
| Lobby menulis “Claude Code tidak ditemukan” | Pasang Claude Code, pastikan `claude --version` jalan di Terminal, lalu buka ulang app |
| Lobby menulis “belum login” | Jalankan `claude` di Terminal, ketik `/login`, lalu buka ulang app |
| “Virtual Office is damaged / can’t be opened” | Jalankan perintah `xattr` di langkah 3 |
| Sesi tidak mulai, terminal menanyakan trust folder | Jawab di jendela Terminal app (panah bawah → Enter) |
