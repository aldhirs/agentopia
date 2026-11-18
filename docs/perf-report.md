# Laporan performa — kantor 3D

Tanggal: 18 Nov 2026 · Electron 45.3.4 (Chromium 156.0.8078.100) · MacBook Pro M1 Pro, 16 GB ·
layar bawaan 1512×982 pt, skala 2×, 120 Hz ·
jendela 1440×859, pixel ratio render 1.75.

Cara mengulang: `npm run build && npx electron scripts/perf.cjs` (hasil mentah: `docs/perf-results.json`),
kebocoran memori: `npx electron scripts/perf-leak.cjs`.

## Skenario

Halaman `src/perf.html` memuat engine 3D yang sama dengan app (tanpa UI lain) dengan N subagent sintetis.
Setiap 2 detik semua agent berganti status (berpikir → bekerja → minta izin → error → selesai …), agent yang
selesai berjalan ke bean bag, dan dua animasi kirim tugas/laporan diluncurkan. 3 detik pemanasan, lalu 10 detik
diukur dari timestamp `requestAnimationFrame`. "Frame panjang" = frame > 33 ms (di bawah 30 FPS).

## Hasil akhir

| Agent | Kurangi animasi | FPS | Rata-rata (ms) | p95 (ms) | p99 (ms) | Frame panjang | Draw call | Segitiga | Lampu | Heap JS (MB) | CPU renderer (%) | CPU GPU proc (%) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | tidak | 116.2 | 8.6 | 11.1 | 16 | 0 | 223 | 25,272 | 5 | 10 | 3.5 | 3.1 |
| 8 | tidak | 118.3 | 8.45 | 9.5 | 12.7 | 0 | 401 | 88,902 | 5 | 14 | 4.6 | 3.5 |
| 16 | tidak | 119.1 | 8.39 | 9.3 | 10.7 | 0 | 553 | 141,896 | 5 | 17 | 6 | 4.5 |
| 32 | tidak | 118.4 | 8.45 | 9.1 | 9.4 | 3 | 811 | 232,772 | 5 | 17 | 7 | 5 |
| 64 | tidak | 116 | 8.62 | 9.3 | 16.5 | 4 | 1075 | 324,820 | 5 | 30 | 10.1 | 6.3 |
| 32 | ya | 119.9 | 8.34 | 9.2 | 9.4 | 0 | 799 | 230,024 | 5 | 14 | 0.6 | 0.7 |

Batas aman: layar 120 Hz → 8.3 ms per frame. Sampai 64 agent, p95 tetap ≈ 9 ms.
Dengan "kurangi animasi", engine hanya menggambar ulang saat ada perubahan, sehingga CPU/GPU hampir nol saat diam
(FPS di baris itu adalah laju `requestAnimationFrame` halaman, bukan jumlah frame yang digambar).

## Masalah yang ditemukan dan diperbaiki

Pengukuran pertama (sebelum optimasi):

| Agent | FPS | p95 (ms) | Frame panjang |
|---|---|---|---|
| 0 | 118 | 9.8 | 0 |
| 8 | 115 | 10.3 | 1 |
| 16 | 60 | 25.7 | 5 |
| 32 | **10.7** | **184** | **91** |

Penyebab: satu `PointLight` per layar monitor/laptop (34 lampu pada 32 agent). Tiap lampu menambah biaya per
piksel di semua material, dan lampu dinyalakan/dimatikan saat status berubah sehingga jumlah lampu berubah dan
shader dikompilasi ulang (patah-patah).

Perbaikan:
1. Cahaya layar diganti bidang transparan aditif (`glowWash`) — tampilan mirip, tanpa lampu. Jumlah lampu kini tetap 5.
2. Bagian kecil (mata, hidung, tangan, rambut keriting, bola billiard, cangkir, keyboard) tidak menghasilkan bayangan.
3. Resolusi adaptif: bila frame > 22 ms selama ±1 detik, pixel ratio turun 0.25 (minimal 1). Pada pengujian ini tidak pernah terpicu.
4. Render berhenti saat app tidak terlihat (`visibilitychange`), dan hanya saat ada perubahan bila "kurangi animasi" aktif.

## Kebocoran memori

15 siklus buat → isi 32 agent → render → `dispose()` (seperti keluar-masuk kantor), GC dipaksa tiap siklus:
heap JS stabil **9.5 MB** di semua siklus; geometri GPU 177–178 dan tekstur 43 per siklus (tidak bertambah).
Tidak ditemukan kebocoran.

## Catatan & batasan

- Diukur di satu mesin (M1 Pro). Mac yang lebih lemah (mis. MacBook Air M1 8 GB) belum diukur; resolusi adaptif dan
  opsi "Kantor 2D" di Pengaturan adalah jaring pengaman.
- Pengukuran dengan jendela di monitor eksternal 75 Hz memberi ±75 FPS (dibatasi refresh rate), bukan masalah performa;
  karena itu pengukuran dikunci ke layar bawaan.
- Ukuran bundle renderer bertambah ±0.8 MB karena three.js (`out/renderer/assets/engine-*.js`).
