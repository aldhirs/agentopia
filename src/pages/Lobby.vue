<!-- Lobby: start a new session, enter a running one, or resume a previous conversation. -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { FolderInfo, HistoryEntry, PermissionMode, SessionInfo } from '../../shared/types';
import { previewCommand } from '../../shared/claudeArgs';
import CharacterBlob from '../components/office/CharacterBlob.vue';
import SettingsDialog from '../components/SettingsDialog.vue';
import { office, openSession, recheckClaude } from '../stores/office';
import { agentColor, agentTag } from '../lib/agentColor';
import { relativeTime, duration } from '../lib/time';

const api = window.office;

// --- form ---
const cwd = ref('');
const name = ref('');
const model = ref('');
const prompt = ref('');
const mode = ref<PermissionMode | ''>('');
const worktree = ref(false);
const starting = ref(false);
const error = ref('');
const folder = ref<FolderInfo | null>(null);

const MODES: Array<{ id: PermissionMode | ''; label: string; desc: string }> = [
  { id: '', label: 'Ikut pengaturan', desc: 'Pakai mode default Claude Code di komputer ini.' },
  { id: 'default', label: 'Minta izin', desc: 'Setiap command dan edit ditanyakan di terminal.' },
  { id: 'acceptEdits', label: 'Auto-edit', desc: 'Edit file langsung, command tetap ditanyakan.' },
  { id: 'plan', label: 'Plan saja', desc: 'Hanya membaca dan menyusun rencana.' },
];

const folderName = computed(() => cwd.value.split(/[\\/]/).filter(Boolean).pop() ?? '');
const command = computed(() => previewCommand({
  cwd: cwd.value, name: name.value || undefined, model: model.value || undefined,
  permissionMode: mode.value || undefined, worktree: worktree.value, prompt: prompt.value,
}));
const claudeReady = computed(() => !!office.claude?.found && office.claude.loggedIn !== false);
const canStart = computed(() => claudeReady.value && !!cwd.value && folder.value?.exists !== false && !starting.value);
const showSettings = ref(false);
const rechecking = ref(false);
async function recheck() {
  rechecking.value = true;
  try { await recheckClaude(); } finally { rechecking.value = false; }
}

let infoSeq = 0;
watch(cwd, async (dir) => {
  const seq = ++infoSeq;
  const info = await api.folderInfo(dir || null);
  if (seq !== infoSeq) return;
  folder.value = info;
  if (!info.isGit) worktree.value = false;
}, { immediate: true });

async function pick() {
  const dir = await api.pickFolder();
  if (dir) cwd.value = dir;
}

async function start() {
  error.value = '';
  starting.value = true;
  try {
    const info = await api.startSession({
      cwd: cwd.value,
      name: name.value.trim() || undefined,
      model: model.value || undefined,
      prompt: prompt.value,
      permissionMode: mode.value || undefined,
      worktree: worktree.value || undefined,
    });
    await openSession(info.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    starting.value = false;
  }
}

// --- team banner ---
const team = computed(() => {
  const members = folder.value?.team ?? [];
  return [{ name: 'lead', label: 'Lead', description: 'Sesi utama' }, ...members.map((m) => ({ name: m.name, label: m.name, description: m.description }))];
});
const teamShown = computed(() => team.value.slice(0, 12));

// --- running sessions ---
const running = computed(() => office.sessions.filter((s) => s.status === 'running'));
function summary(s: SessionInfo) {
  const st = office.states[s.id];
  const agents = st ? st.order.map((id) => st.agents[id]) : [];
  const active = agents.filter((a) => !['done', 'idle'].includes(a.status));
  const waiting = agents.filter((a) => a.status === 'waiting').length;
  const lead = st?.agents.lead;
  let label = 'Siap';
  let tone = 'idle';
  if (waiting) { label = `${waiting} minta izin`; tone = 'wait'; }
  else if (lead?.status === 'waiting_user' || lead?.status === 'done') { label = 'Menunggu kamu'; tone = 'idle'; }
  else if (active.length) { label = 'Bekerja'; tone = 'tool'; }
  const subs = agents.filter((a) => a.kind === 'subagent').length;
  const people = subs ? `Lead + ${subs} subagent` : 'Lead saja';
  return { agents: active.length ? active : agents.slice(0, 1), people, label, tone };
}

// --- history ---
const runningHistoryIds = computed(() => new Set(running.value.map((s) => s.historyId)));
const previous = computed(() => office.history.filter((h) => !runningHistoryIds.value.has(h.id)).slice(0, 20));
const resuming = ref<string | null>(null);
function historySummary(h: HistoryEntry) {
  const n = h.subagentTypes.length;
  const parts = [n ? `${n} subagent` : 'tanpa subagent'];
  if (h.endedAt) parts.push(`${duration(h.endedAt - h.startedAt)}`);
  return parts.join(' · ');
}
async function resume(h: HistoryEntry) {
  error.value = '';
  resuming.value = h.id;
  try {
    const info = await api.resumeSession(h.id);
    await openSession(info.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    resuming.value = null;
  }
}

onMounted(() => {
  if (!cwd.value && office.recentFolders.length) cwd.value = office.recentFolders[0];
});
watch(() => office.recentFolders, (f) => { if (!cwd.value && f.length) cwd.value = f[0]; });
</script>

<template>
  <div class="lobby">
    <header class="top">
      <div class="brand">
        <div class="logo" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F3F1EC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></svg>
        </div>
        <h1>Virtual Office</h1>
      </div>
      <span v-if="office.claude?.found && office.claude.loggedIn" class="chip ok"><span class="pulse" />Claude Code {{ office.claude.version }} · login {{ office.claude.subscriptionType ?? office.claude.authMethod }}</span>
      <template v-else-if="office.claude">
        <span class="chip" :class="office.claude.found ? 'warn' : 'bad'">
          <template v-if="office.claude.found">Claude Code belum login · jalankan <code>claude</code> lalu <code>/login</code> di Terminal</template>
          <template v-else>{{ office.claude.error }}</template>
        </span>
        <button type="button" class="small" :disabled="rechecking" @click="recheck">{{ rechecking ? 'Mengecek…' : 'Cek ulang' }}</button>
      </template>
      <button type="button" class="small gear" aria-label="Pengaturan" @click="showSettings = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      </button>
    </header>

    <section class="banner" aria-labelledby="team-title">
      <h2 id="team-title">Tim kamu sudah di lobby</h2>
      <p>Satu sesi Claude Code jadi satu kantor. Lead adalah sesi utama; yang lain subagent yang dipanggil Lead saat dibutuhkan.
        <template v-if="folderName"> Tim untuk <strong>{{ folderName }}</strong>:</template></p>
      <ul class="team">
        <li v-for="(m, i) in teamShown" :key="m.name" :title="m.description">
          <CharacterBlob :color="agentColor(m.name)" status="idle" :tag="agentTag(m.name)" :size="48" :style="{ animationDelay: `${-i * 0.4}s` }" />
          <span>{{ m.label }}</span>
        </li>
        <li v-if="team.length > teamShown.length" class="more">+{{ team.length - teamShown.length }}</li>
      </ul>
    </section>

    <main class="grid">
      <section class="card form" aria-labelledby="new-title">
        <div>
          <h2 id="new-title">Mulai sesi baru</h2>
          <p class="sub">Menjalankan <code>claude</code> di folder pilihanmu, lalu membuka kantornya.</p>
        </div>

        <div class="field">
          <label for="f-dir">Folder project</label>
          <div class="inline">
            <input id="f-dir" v-model="cwd" class="mono" placeholder="/path/ke/project" />
            <button type="button" @click="pick">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              Pilih…
            </button>
          </div>
          <p v-if="cwd && folder && !folder.exists" class="field-error">Folder tidak ditemukan.</p>
          <div v-if="office.recentFolders.length" class="recent">
            <span>Terakhir:</span>
            <button v-for="f in office.recentFolders" :key="f" type="button" class="mono" :class="{ on: f === cwd }" @click="cwd = f">{{ f.split('/').slice(-2).join('/') }}</button>
          </div>
        </div>

        <div class="two">
          <div class="field">
            <label for="f-name">Nama sesi <span class="opt">(opsional)</span></label>
            <input id="f-name" v-model="name" :placeholder="folderName || 'nama-sesi'" />
          </div>
          <div class="field">
            <label for="f-model">Model</label>
            <select id="f-model" v-model="model">
              <option value="">Default dari pengaturan</option>
              <option value="opus">opus</option>
              <option value="sonnet">sonnet</option>
              <option value="haiku">haiku</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label for="f-prompt">Tugas awal <span class="opt">(boleh kosong, bisa diketik nanti di terminal)</span></label>
          <textarea id="f-prompt" v-model="prompt" rows="3" />
        </div>

        <fieldset class="field">
          <legend>Mode izin</legend>
          <div class="modes">
            <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :class="{ on: mode === m.id }" @click="mode = m.id">
              <strong>{{ m.label }}</strong>
              <span>{{ m.desc }}</span>
            </button>
          </div>
        </fieldset>

        <label class="check" :class="{ disabled: !folder?.isGit }">
          <input v-model="worktree" type="checkbox" :disabled="!folder?.isGit" />
          Jalankan di git worktree terpisah
          <span class="opt">{{ folder?.isGit ? '(aman bila ada sesi lain di folder yang sama)' : '(hanya untuk folder git)' }}</span>
        </label>

        <div class="cmd">
          <p>Perintah yang dijalankan</p>
          <code>{{ command }}</code>
        </div>

        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <p v-if="!claudeReady && office.claude" class="field-error">Sesi belum bisa dimulai: {{ office.claude.found ? 'Claude Code belum login.' : 'Claude Code tidak ditemukan (atur lokasinya di Pengaturan).' }}</p>
        <div class="actions">
          <p class="sub">Tanpa API key · masuk kuota langganan Claude kamu</p>
          <button type="button" class="primary" :disabled="!canStart" @click="start">
            {{ starting ? 'Memulai…' : 'Mulai sesi & masuk kantor' }}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      </section>

      <div class="side">
        <section class="card" aria-labelledby="run-title">
          <div class="head"><h2 id="run-title">Sedang berjalan</h2><span class="sub">{{ running.length }} sesi</span></div>
          <p v-if="!running.length" class="sub">Belum ada sesi yang berjalan.</p>
          <div v-for="s in running" :key="s.id" class="run">
            <div class="row">
              <div class="grow">
                <p class="title">{{ s.name }}</p>
                <p class="mono meta">{{ s.cwd }} · {{ relativeTime(s.startedAt) }}</p>
              </div>
              <span class="pill" :class="summary(s).tone">{{ summary(s).label }}</span>
            </div>
            <div class="row">
              <div class="avatars">
                <span v-for="a in summary(s).agents.slice(0, 6)" :key="a.id" class="avatar" :title="a.label" :style="{ background: agentColor(a.type) }" />
              </div>
              <span class="sub grow">{{ summary(s).people }}</span>
              <button type="button" class="dark" @click="openSession(s.id)">Masuk</button>
            </div>
          </div>
        </section>

        <section class="card" aria-labelledby="hist-title">
          <h2 id="hist-title">Sesi sebelumnya</h2>
          <p v-if="!previous.length" class="sub">Riwayat sesi yang kamu mulai dari app ini akan muncul di sini.</p>
          <div v-for="h in previous" :key="h.id" class="hist">
            <div class="grow">
              <p class="title">{{ h.name }}</p>
              <p class="meta"><span class="mono">{{ h.cwd.split('/').slice(-2).join('/') }}</span> · {{ relativeTime(h.lastActiveAt ?? h.startedAt) }} · {{ historySummary(h) }}</p>
              <p v-if="h.lastActivity" class="last">{{ h.lastActivity }}</p>
            </div>
            <button
              type="button"
              :disabled="!h.claudeSessionId || resuming === h.id"
              :title="h.claudeSessionId ? 'Lanjutkan percakapan ini (claude --resume)' : 'Sesi ini berakhir sebelum Claude Code memberi ID, jadi tidak bisa dilanjutkan'"
              @click="resume(h)"
            >{{ resuming === h.id ? 'Membuka…' : 'Lanjutkan' }}</button>
          </div>
        </section>
      </div>
    </main>
    <SettingsDialog v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.lobby { height: 100%; overflow-y: auto; background: var(--cream); }
.top { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding: 16px 32px; background: #fff; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: center; gap: 12px; margin-right: auto; }
.logo { width: 36px; height: 36px; border-radius: 10px; background: var(--ink); display: grid; place-items: center; }
h1 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
.chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 500; }
.chip.ok { background: var(--st-done-bg); color: var(--st-done-fg); }
.chip.warn { background: var(--st-wait-bg); color: var(--st-wait-fg); }
.chip.bad { background: var(--st-error-bg); color: var(--st-error-fg); }
.small { min-height: 36px; padding: 0 12px; font-size: 13px; }
.gear { width: 40px; padding: 0; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: #15803d; animation: pulse 1.4s ease-in-out infinite; }

.banner { margin: 24px 32px 0; padding: 22px 28px 0; border-radius: 20px; background-color: var(--floor); background-image: repeating-linear-gradient(90deg, rgba(120, 90, 50, 0.07) 0 2px, transparent 2px 64px); }
.banner h2 { margin: 0; font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
.banner p { margin: 6px 0 0; max-width: 760px; font-size: 14px; line-height: 1.5; color: #4a4853; }
.team { list-style: none; margin: 14px 0 0; padding: 0 0 14px; display: flex; gap: 18px; overflow-x: auto; }
.team li { flex: none; width: 104px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.team li span { max-width: 100%; font-size: 12px; font-weight: 600; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.team .more { justify-content: center; font-weight: 600; color: var(--ink-2); }

.grid { display: flex; flex-wrap: wrap; gap: 24px; padding: 24px 32px 40px; align-items: flex-start; }
.card { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 20px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.card h2 { margin: 0; font-family: var(--font-display); font-size: 18px; font-weight: 600; }
.form { flex: 3 1 560px; gap: 18px; padding: 24px; }
.side { flex: 2 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.sub { margin: 0; font-size: 13px; color: var(--muted); }
.field { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; border: 0; min-width: 0; }
.field label, .field legend { font-size: 13px; font-weight: 600; padding: 0; margin-bottom: 0; }
.field legend { margin-bottom: 8px; }
.opt { font-weight: 400; color: var(--muted); }
.inline { display: flex; gap: 8px; }
input, select, textarea { min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); font: inherit; font-size: 14px; color: var(--ink); background: #fff; min-width: 0; }
.inline input { flex: 1; }
input.mono { font-family: var(--font-mono); font-size: 13px; }
textarea { padding: 10px 12px; line-height: 1.45; resize: vertical; }
button { min-height: 44px; padding: 0 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; font-size: 14px; font-weight: 500; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.recent { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.recent span { font-size: 12px; color: var(--muted); }
.recent button { min-height: 32px; padding: 0 10px; font-size: 12px; }
.recent button.on { background: var(--accent-soft); border-color: var(--accent); }
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.modes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.modes button { flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 4px; padding: 12px; text-align: left; border-width: 2px; border-color: var(--line); }
.modes button.on { border-color: var(--accent); background: var(--accent-soft); }
.modes strong { font-size: 14px; }
.modes span { font-size: 12px; line-height: 1.4; color: var(--muted); font-weight: 400; }
.check { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; cursor: pointer; }
.check input { width: 18px; height: 18px; min-height: 0; accent-color: var(--accent); }
.check.disabled { color: var(--muted); cursor: default; }
.cmd { padding: 12px 14px; border-radius: 12px; background: var(--term-bg); }
.cmd p { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--term-muted); }
.cmd code { display: block; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.6; color: var(--term-fg); white-space: pre-wrap; word-break: break-all; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.actions .sub { margin-right: auto; font-size: 12px; }
.primary { min-height: 48px; padding: 0 22px; background: var(--accent); border-color: var(--accent); color: #fff; font-size: 15px; font-weight: 600; }
.field-error { margin: 0; font-size: 13px; color: var(--st-error-fg); }

.head { display: flex; align-items: baseline; justify-content: space-between; }
.run { padding: 14px; border: 1px solid var(--line); border-radius: 14px; display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; align-items: center; gap: 10px; }
.grow { flex: 1; min-width: 0; }
.title { margin: 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { margin: 2px 0 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pill { flex: none; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.pill.idle { background: var(--st-idle-bg); color: var(--st-idle-fg); }
.pill.tool { background: var(--st-tool-bg); color: var(--st-tool-fg); }
.pill.wait { background: var(--st-wait-bg); color: var(--st-wait-fg); }
.avatars { display: flex; }
.avatar { width: 26px; height: 26px; margin-right: -6px; border-radius: 46% 46% 40% 40%; border: 2px solid #fff; }
.dark { background: var(--ink); border-color: var(--ink); color: #fff; font-weight: 600; }
.hist { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #eeeae3; }
.hist .title { font-size: 14px; }
.last { margin: 4px 0 0; font-size: 12px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (max-width: 760px) { .modes { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two { grid-template-columns: 1fr; } }
</style>
