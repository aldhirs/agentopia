<!-- Temporary lobby (Phase 2). The designed Lobby replaces this in Phase 4. -->
<script setup lang="ts">
import { ref } from 'vue';
import type { PermissionMode } from '../../shared/types';
import { office, openSession } from '../stores/office';

const api = window.office;
const cwd = ref('');
const prompt = ref('');
const mode = ref<PermissionMode | ''>('');
const error = ref('');
const starting = ref(false);

async function pick() {
  const dir = await api.pickFolder();
  if (dir) cwd.value = dir;
}

async function start() {
  error.value = '';
  starting.value = true;
  try {
    const info = await api.startSession({ cwd: cwd.value, prompt: prompt.value, permissionMode: mode.value || undefined });
    await openSession(info.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <main class="lobby">
    <header>
      <h1>Virtual Office</h1>
      <p v-if="office.claude?.found" class="status ok">
        Claude Code {{ office.claude.version }} ·
        {{ office.claude.loggedIn ? `login ${office.claude.subscriptionType ?? office.claude.authMethod}` : 'belum login' }}
      </p>
      <p v-else-if="office.claude" class="status bad">{{ office.claude.error }}</p>
    </header>

    <section class="card">
      <h2>Mulai sesi</h2>
      <div class="field">
        <label for="cwd">Folder project</label>
        <div class="inline">
          <input id="cwd" v-model="cwd" class="mono" placeholder="/path/ke/project" />
          <button type="button" @click="pick">Pilih…</button>
        </div>
      </div>
      <div class="field">
        <label for="prompt">Tugas awal <span class="muted">(boleh kosong)</span></label>
        <input id="prompt" v-model="prompt" />
      </div>
      <div class="field">
        <label for="mode">Mode izin</label>
        <select id="mode" v-model="mode">
          <option value="">Ikut pengaturan Claude Code</option>
          <option value="default">Minta izin</option>
          <option value="acceptEdits">Auto-edit</option>
          <option value="plan">Plan saja</option>
          <option value="auto">Auto</option>
        </select>
      </div>
      <p class="hint">Folder yang belum pernah dibuka dengan Claude Code akan menanyakan konfirmasi di Terminal. Pilih “Yes, I trust this folder”.</p>
      <p v-if="error" class="bad">{{ error }}</p>
      <button type="button" class="primary" :disabled="!cwd || starting" @click="start">
        {{ starting ? 'Memulai…' : 'Mulai sesi & masuk kantor' }}
      </button>
    </section>

    <section v-if="office.sessions.length" class="card">
      <h2>Sesi</h2>
      <ul class="sessions">
        <li v-for="s in office.sessions" :key="s.id">
          <div>
            <strong>{{ s.name }}</strong>
            <span class="muted mono"> · {{ s.cwd }}</span>
          </div>
          <span class="pill" :class="s.status">{{ s.status === 'running' ? 'Berjalan' : 'Selesai' }}</span>
          <button type="button" @click="openSession(s.id)">Masuk</button>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.lobby { min-height: 100%; background: var(--cream); padding: 28px 32px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; }
header h1 { margin: 0; font-family: var(--font-display); font-size: 24px; }
.status { margin: 4px 0 0; font-size: 13px; }
.card { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 20px; max-width: 760px; display: flex; flex-direction: column; gap: 14px; }
.card h2 { margin: 0; font-family: var(--font-display); font-size: 18px; }
.field { display: flex; flex-direction: column; gap: 6px; }
label { font-size: 13px; font-weight: 600; }
.inline { display: flex; gap: 8px; }
input, select { min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); font: inherit; font-size: 14px; background: #fff; flex: 1; min-width: 0; }
button { min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; font-weight: 500; cursor: pointer; }
button.primary { align-self: flex-start; background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; padding: 0 20px; }
button:disabled { opacity: 0.55; cursor: default; }
.hint { margin: 0; font-size: 12px; color: var(--muted); }
.sessions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sessions li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #eeeae3; }
.sessions li > div { margin-right: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill { padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.pill.running { background: var(--st-tool-bg); color: var(--st-tool-fg); }
.pill.exited { background: var(--st-idle-bg); color: var(--st-idle-fg); }
.muted { color: var(--muted); font-weight: 400; }
.ok { color: var(--st-done-fg); } .bad { color: var(--st-error-fg); margin: 0; }
</style>
