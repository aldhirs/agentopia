<!-- Phase 1 debug console: start/stop sessions and watch raw hooks + derived agent state.
     Replaced by the Lobby / Office UI in Phase 2–4. -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ClaudeInfo, HookRecord, OfficeState, PermissionMode, SessionInfo } from '../shared/types';

const api = window.office;

const claude = ref<ClaudeInfo | null>(null);
const sessions = ref<SessionInfo[]>([]);
const selectedId = ref<string | null>(null);
const states = ref<Record<string, OfficeState>>({});
const hooks = ref<HookRecord[]>([]);
const output = ref<Record<string, string>>({});
const error = ref('');

const cwd = ref('');
const prompt = ref('');
const mode = ref<PermissionMode | ''>('');
const input = ref('');

const selected = computed(() => sessions.value.find((s) => s.id === selectedId.value) ?? null);
const state = computed(() => (selectedId.value ? states.value[selectedId.value] : undefined));
const agents = computed(() => (state.value ? state.value.order.map((id) => state.value!.agents[id]) : []));
const sessionHooks = computed(() => hooks.value.filter((h) => h.sessionId === selectedId.value).slice(-150).reverse());
const plainOutput = computed(() => stripAnsi(output.value[selectedId.value ?? ''] ?? '').slice(-6000));

function stripAnsi(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '');
}

async function pick() {
  const dir = await api.pickFolder();
  if (dir) cwd.value = dir;
}

async function start() {
  error.value = '';
  try {
    const info = await api.startSession({
      cwd: cwd.value,
      prompt: prompt.value,
      permissionMode: mode.value || undefined,
    });
    selectedId.value = info.id;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

function send() {
  if (!selectedId.value) return;
  api.write(selectedId.value, input.value + '\r');
  input.value = '';
}

const offs: Array<() => void> = [];
onMounted(async () => {
  claude.value = await api.claudeInfo();
  sessions.value = await api.listSessions();
  offs.push(
    api.onSessions((list) => { sessions.value = list; }),
    api.onState((s) => { states.value = { ...states.value, [s.sessionId]: s }; }),
    api.onHook((r) => { hooks.value = [...hooks.value.slice(-1000), r]; }),
    api.onPtyData((id, d) => {
      const cur = (output.value[id] ?? '') + d;
      output.value = { ...output.value, [id]: cur.length > 200_000 ? cur.slice(-100_000) : cur };
    }),
  );
});
onUnmounted(() => offs.forEach((off) => off()));

const fmt = (t: number) => new Date(t).toLocaleTimeString();
</script>

<template>
  <div class="page">
    <header>
      <h1>Virtual Office · debug</h1>
      <p v-if="claude?.found">
        claude {{ claude.version }} · {{ claude.path }} ·
        <strong :class="claude.loggedIn ? 'ok' : 'bad'">{{ claude.loggedIn ? `login ${claude.subscriptionType ?? claude.authMethod}` : 'belum login' }}</strong>
      </p>
      <p v-else-if="claude" class="bad">{{ claude.error }}</p>
    </header>

    <section class="card">
      <h2>Mulai sesi</h2>
      <div class="row">
        <label for="cwd">Folder</label>
        <input id="cwd" v-model="cwd" placeholder="/path/ke/project" />
        <button type="button" @click="pick">Pilih…</button>
      </div>
      <div class="row">
        <label for="prompt">Tugas awal</label>
        <input id="prompt" v-model="prompt" placeholder="opsional" />
      </div>
      <div class="row">
        <label for="mode">Mode izin</label>
        <select id="mode" v-model="mode">
          <option value="">ikut pengaturan</option>
          <option value="default">default (minta izin)</option>
          <option value="acceptEdits">acceptEdits</option>
          <option value="plan">plan</option>
          <option value="auto">auto</option>
        </select>
        <button type="button" class="primary" :disabled="!cwd" @click="start">Mulai</button>
      </div>
      <p v-if="error" class="bad">{{ error }}</p>
    </section>

    <section class="card">
      <h2>Sesi</h2>
      <ul class="sessions">
        <li v-for="s in sessions" :key="s.id">
          <button type="button" :class="{ active: s.id === selectedId }" @click="selectedId = s.id">
            {{ s.name }} · {{ s.status }}<span v-if="s.exitCode !== undefined"> ({{ s.exitCode }})</span>
          </button>
          <button v-if="s.status === 'running'" type="button" @click="api.stopSession(s.id)">Stop</button>
        </li>
        <li v-if="!sessions.length" class="muted">Belum ada sesi.</li>
      </ul>
    </section>

    <div v-if="selected" class="grid">
      <section class="card">
        <h2>Agent ({{ agents.length }})</h2>
        <table>
          <thead><tr><th>Agent</th><th>Status</th><th>Aktivitas</th></tr></thead>
          <tbody>
            <tr v-for="a in agents" :key="a.id">
              <td>{{ a.label }}<small v-if="a.description"> — {{ a.description }}</small></td>
              <td><code>{{ a.status }}</code></td>
              <td><code>{{ a.activity }}</code></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Hooks ({{ sessionHooks.length }})</h2>
        <ol class="hooks">
          <li v-for="(h, i) in sessionHooks" :key="i">
            <code>{{ fmt(h.at) }} {{ h.payload.hook_event_name }}
              {{ h.payload.agent_type || 'lead' }}{{ h.payload.agent_id ? '#' + h.payload.agent_id.slice(0, 6) : '' }}
              {{ h.payload.tool_name ?? h.payload.notification_type ?? '' }}</code>
          </li>
        </ol>
      </section>

      <section class="card wide">
        <h2>Output terminal (teks mentah, terminal penuh di Phase 2)</h2>
        <pre>{{ plainOutput }}</pre>
        <form class="row" @submit.prevent="send">
          <label for="pty-in">Kirim ke terminal</label>
          <input id="pty-in" v-model="input" placeholder="ketik lalu Enter (kosong = Enter saja)" />
          <button type="submit">Kirim</button>
        </form>
      </section>
    </div>
  </div>
</template>

<style>
:root { color-scheme: light; font-family: Inter, system-ui, sans-serif; color: #1c1b22; background: #f3f1ec; }
body { margin: 0; }
.page { padding: 20px 28px; display: flex; flex-direction: column; gap: 16px; }
header h1 { margin: 0; font-size: 20px; }
header p { margin: 4px 0 0; font-size: 13px; }
.card { background: #fff; border: 1px solid #e3dfd7; border-radius: 12px; padding: 14px 16px; }
.card h2 { margin: 0 0 10px; font-size: 15px; }
.row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.row label { width: 110px; font-size: 13px; }
.row input, .row select { flex: 1; min-height: 34px; padding: 0 10px; border: 1px solid #d2ccc1; border-radius: 8px; font: inherit; }
button { min-height: 34px; padding: 0 12px; border-radius: 8px; border: 1px solid #d2ccc1; background: #fff; font: inherit; cursor: pointer; }
button.primary { background: #3b4bd8; color: #fff; border-color: #3b4bd8; }
button:disabled { opacity: .5; cursor: default; }
.sessions { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.sessions li { display: flex; gap: 4px; }
.sessions button.active { border-color: #1c1b22; font-weight: 600; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.wide { grid-column: 1 / -1; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
td, th { text-align: left; padding: 4px 6px; border-bottom: 1px solid #eeeae3; vertical-align: top; }
.hooks { margin: 0; padding: 0; list-style: none; max-height: 320px; overflow: auto; font-size: 12px; }
pre { background: #16151b; color: #e8e6f0; padding: 12px; border-radius: 8px; max-height: 360px; overflow: auto; font-size: 12px; white-space: pre-wrap; }
.ok { color: #166534; } .bad { color: #b42318; } .muted { color: #5e5b66; }
</style>
