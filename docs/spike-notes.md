# Phase 0 — Catatan spike

Tanggal: 18 Nov 2026 · Claude Code 2.1.327 · macOS (arm64) · Node 26.13 · node-pty 1.1.0
Script: `spike/run.mjs` · Rekaman: `spike/out/hooks-run-auto.jsonl`, `spike/out/hooks-run-manual.jsonl`, `spike/out/pty.log`

Skenario: `claude` interaktif di node-pty (cwd `spike/sandbox`, model sonnet) dengan prompt
"jalankan 2 subagent Explore paralel (A: list `./a`, B: baca `./b/note.txt`), lalu `touch permission-test.txt`, lalu jawab done".
Dijalankan 2×: mode izin default mesin (`auto`) dan `--permission-mode manual`.

## Kesimpulan

| Pertanyaan | Jawaban | Bukti |
|---|---|---|
| `claude` jalan di node-pty dengan login langganan? | **Ya.** `ANTHROPIC_API_KEY` dihapus dari env saat spawn | Sesi selesai normal (exit 0), `touch` tereksekusi |
| Hooks bisa disuntik per sesi tanpa ubah `~/.claude`? | **Ya**, via `--settings '<json>'` | Semua event masuk ke server spike |
| Hook bisa kirim event tanpa `curl`/shell? | **Ya**, hook `type: "http"` + header `Authorization: Bearer $VO_TOKEN` (`allowedEnvVars`) | Semua request `auth_ok: true`. Portabel ke Windows |
| Tool call subagent bisa dibedakan per instance? | **Ya.** `PreToolUse`/`PostToolUse` membawa `agent_id` + `agent_type` | Dua `Explore` paralel punya `agent_id` berbeda |
| Bisa menghubungkan panggilan `Agent` di Lead ke instance subagent? | **Ya.** `PostToolUse` tool `Agent` → `tool_response.agentId` (+ `description`, `subagent_type` di `tool_input`) | `toolu_01Ejm…` → `a0c3805426a88f57f` |
| Event izin tersedia? | **Ya.** `PermissionRequest` (tool + input), dijawab di TUI, lalu `PostToolUse` | Run manual: `PreToolUse Bash` → `PermissionRequest` → `PostToolUse` |

**Keputusan:** sumber event utama = **HTTP hooks** yang disuntik lewat `--settings`. Transcript JSONL hanya
dipakai untuk mengisi detail (mis. teks laporan subagent), tidak untuk status.

## Temuan penting untuk implementasi

1. **Subagent berjalan async.** `PostToolUse` untuk tool `Agent` langsung kembali dengan
   `status: "async_launched"`. Lead bisa memicu `Stop` saat subagent masih bekerja.
   `Stop.background_tasks` berisi daftar subagent yang masih `running`, jadi status Lead
   saat itu = **menunggu subagent**, bukan selesai.
2. **Laporan balik ke Lead.** Sinyal utama: `SubagentStop` dengan `agent_id` subagent.
   Lead lalu menerima giliran baru lewat `UserPromptSubmit` berisi `<agent-message from="<agentId>">`
   atau `<task-notification><task-id><agentId>` (bentuknya berbeda antar run). Pakai `SubagentStop`
   untuk animasi garis hijau, dan jangan tampilkan prompt sintetis ini sebagai pesan dari user.
3. **Agent internal harus disaring.** Ada `SubagentStop` dengan `agent_type: ""` (prompt suggestion
   internal, `last_assistant_message: "Stay silent."`). Abaikan agent dengan `agent_type` kosong.
4. **Subagent bisa memakai tool `SubagentHandback`** untuk menyerahkan laporan. Tampilkan sebagai "melapor ke Lead".
5. **Mode izin default di mesin ini adalah `auto`.** Di mode itu, perintah sederhana diizinkan otomatis
   dan `PermissionRequest` tidak muncul. Status "Minta izin" hanya terlihat di mode `default`/`manual`.
6. **Akhir status "Minta izin":** `PermissionRequest` → set `waiting`; kembali ke `tool_use`/`thinking` saat
   `PostToolUse` atau `PostToolUseFailure` untuk tool yang sama. `Notification` `permission_prompt` **tidak**
   muncul di run ini; jangan bergantung padanya.
7. **`Notification` `idle_prompt`** muncul ±60 detik setelah Lead berhenti ("Claude is waiting for your input").
   Bisa dipakai untuk status Lead "menunggu kamu".
8. **Path transcript subagent** ada di `SubagentStop.agent_transcript_path`:
   `~/.claude/projects/<project>/<sessionId>/subagents/agent-<agentId>.jsonl`.
9. **Gotcha packaging:** `npm` memblokir install script node-pty (`allowScripts`), sehingga
   `prebuilds/darwin-*/spawn-helper` tidak executable → `posix_spawnp failed`. Perbaikan: `chmod +x`
   pada spawn-helper (atau `npm install-scripts approve node-pty`). Wajib ditangani di build Electron.
10. Prompt workspace trust tidak muncul karena folder sudah dipercaya. App tetap perlu menangani
    layar trust di terminal untuk folder baru (user menjawab langsung di jendela Terminal).

## Pemetaan event → status karakter (final untuk Phase 3)

| Event | Kondisi | Efek |
|---|---|---|
| `UserPromptSubmit` | prompt bukan `<agent-message`/`<task-notification` | Lead → `thinking` |
| `PreToolUse` tool `Agent` | dari Lead | garis biru Lead → meja baru (tipe dari `tool_input.subagent_type`) |
| `SubagentStart` | `agent_type` tidak kosong | karakter masuk meja, `thinking` |
| `PostToolUse` tool `Agent` | — | hubungkan `tool_use_id` ↔ `tool_response.agentId` |
| `PreToolUse` | tool lain | agent (`agent_id` atau Lead) → `tool_use` + nama tool |
| `PermissionRequest` | — | agent → `waiting` (tanda "!") |
| `PostToolUse` | — | agent → `thinking` |
| `PostToolUseFailure` | — | agent → `error` sesaat, lalu `thinking` |
| `SubagentStop` | `agent_type` tidak kosong | subagent → `done`, garis hijau ke Lead |
| `Stop` (Lead) | `background_tasks` masih ada subagent running | Lead → "menunggu subagent" |
| `Stop` (Lead) | tidak ada yang running | Lead → `done` / idle |
| `Notification` `idle_prompt` | — | Lead → "menunggu kamu" |
| `SessionEnd` | — | sesi selesai, semua karakter idle |

## Belum diuji (dibawa ke phase berikut)

- `--settings` hooks digabung atau menggantikan hooks milik user: mesin ini tidak punya user-level hooks.
  Uji saat ada user dengan hooks sendiri.
- Jalur tolak izin (`PermissionDenied`) dan tool gagal (`PostToolUseFailure`).
- Subagent memanggil subagent (nested) dan `--worktree`.
- Resume sesi (`--resume`).
- `SessionStart` terdaftar di settings tetapi tidak terekam di kedua run. Penyebabnya belum diketahui;
  app tidak boleh bergantung pada event ini (pakai spawn proses sebagai tanda sesi mulai).
