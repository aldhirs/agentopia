<!-- One session = one office: full-screen floor with floating windows (Terminal, character detail). -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import OverlayWindow, { type WinState } from '../components/OverlayWindow.vue';
import TerminalPane from '../components/TerminalPane.vue';
import StructuredLog from '../components/StructuredLog.vue';
import OfficeFloor from '../components/office/OfficeFloor.vue';
import Office3D from '../components/office/Office3D.vue';
import AgentDetail from '../components/office/AgentDetail.vue';
import CharacterBlob from '../components/office/CharacterBlob.vue';
import MusicToggle from '../components/MusicToggle.vue';
import { leaveSession, office, openSession } from '../stores/office';
import { agentColor, agentTag } from '../lib/agentColor';
import { STATUS_META } from '../lib/status';

const props = defineProps<{ sessionId: string }>();
const api = window.office;

const session = computed(() => office.sessions.find((s) => s.id === props.sessionId));
const state = computed(() => office.states[props.sessionId]);

const counts = computed(() => {
  const agents = state.value ? Object.values(state.value.agents) : [];
  const active = agents.filter((a) => !['done', 'idle'].includes(a.status)).length;
  const waiting = agents.filter((a) => a.status === 'waiting').length;
  return { active, waiting, done: agents.filter((a) => a.kind === 'subagent' && a.status === 'done').length };
});

// --- windows ---
let zTop = 12;
const termWin = reactive<WinState>({ mode: 'normal', pos: null, z: 10 });
const detailWin = reactive<WinState>({ mode: 'min', pos: null, z: 11 });
const tab = ref<'term' | 'log'>('term');

const selectedId = ref<string | null>(null);
const anchor = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const selected = computed(() => (selectedId.value && state.value ? state.value.agents[selectedId.value] : undefined));
const roster = computed(() => (state.value ? state.value.order.map((id) => state.value!.agents[id]) : []));

// 3D office unless the user picked 2D in settings or WebGL is not available.
const failed3d = ref('');
const use3d = computed(() => office.settings?.officeView !== '2d' && !failed3d.value);

function select(id: string) {
  selectedId.value = id;
  detailWin.pos = null; // re-anchor next to the newly picked character
  if (detailWin.mode === 'min') detailWin.mode = 'normal';
  detailWin.z = ++zTop;
}

const stage = ref<HTMLElement | null>(null);
const CARD_W = 360;
const CARD_H = 440;
const detailStyle = computed<Record<string, string>>(() => {
  const W = stage.value?.clientWidth ?? 1440;
  const H = stage.value?.clientHeight ?? 900;
  const a = anchor.value;
  let left = 16, top = 140;
  if (a) {
    left = a.x + a.w + 12;
    if (left + CARD_W > W - 16) left = a.x - 12 - CARD_W;
    left = Math.max(16, left);
    top = Math.max(140, Math.min(a.y, H - 16 - CARD_H));
  }
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${CARD_W}px`, maxHeight: `${CARD_H}px` };
});

const dock = computed(() => {
  const d: Array<{ key: 'term' | 'detail'; label: string; color: string }> = [];
  if (termWin.mode === 'min') d.push({ key: 'term', label: 'Terminal', color: '#E8A07A' });
  if (detailWin.mode === 'min' && selected.value) {
    d.push({ key: 'detail', label: `Detail · ${selected.value.label}`, color: agentColor(selected.value.type) });
  }
  return d;
});
function restore(key: 'term' | 'detail') {
  const w = key === 'term' ? termWin : detailWin;
  w.mode = 'normal';
  w.z = ++zTop;
}

const exited = computed(() => session.value?.status === 'exited');
const canResume = computed(() => {
  const h = office.history.find((x) => x.id === session.value?.historyId);
  return !!h?.claudeSessionId && !office.sessions.some((x) => x.historyId === h.id && x.status === 'running');
});
const resuming = ref(false);
const resumeError = ref('');
async function resume() {
  if (!session.value) return;
  resuming.value = true;
  resumeError.value = '';
  try {
    const info = await api.resumeSession(session.value.historyId);
    await openSession(info.id);
  } catch (e) {
    resumeError.value = (e as Error).message;
  } finally {
    resuming.value = false;
  }
}

const stopping = ref(false);
async function stop() {
  stopping.value = true;
  try { await api.stopSession(props.sessionId); } finally { stopping.value = false; }
}
</script>

<template>
  <div ref="stage" class="stage">
    <Office3D
      v-if="state && use3d"
      :state="state"
      :selected-id="detailWin.mode === 'min' ? null : selectedId"
      @select="select"
      @anchor="anchor = $event"
      @failed="failed3d = $event"
    />
    <OfficeFloor
      v-else-if="state"
      :state="state"
      :selected-id="detailWin.mode === 'min' ? null : selectedId"
      @select="select"
      @anchor="anchor = $event"
    />

    <div class="card session-card">
      <div class="row">
        <button type="button" class="back" aria-label="Kembali ke lobby" @click="leaveSession">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1>Sesi · {{ session?.name }}</h1>
        <span class="pill" :class="session?.status === 'running' ? 'run' : 'off'">{{ session?.status === 'running' ? 'Berjalan' : 'Selesai' }}</span>
        <MusicToggle class="music-toggle" />
      </div>
      <p class="mono path">{{ session?.cwd }}</p>
      <div class="row">
        <span class="meta">{{ counts.active }} aktif · {{ counts.done }} subagent selesai<template v-if="counts.waiting"> · <strong class="warn">{{ counts.waiting }} minta izin</strong></template></span>
        <button v-if="session?.status === 'running'" type="button" class="stop" :disabled="stopping" @click="stop">
          {{ stopping ? 'Menghentikan…' : 'Hentikan sesi' }}
        </button>
      </div>
      <ul class="roster" aria-label="Tim di kantor ini">
        <li v-for="a in roster" :key="a.id">
          <button
            type="button" class="desk roster-chip" :class="{ on: a.id === selectedId && detailWin.mode !== 'min' }"
            :aria-label="`${a.label}, ${STATUS_META[a.status].label}`" @click="select(a.id)"
          >
            <span class="dot" :style="{ background: agentColor(a.kind === 'lead' ? 'lead' : a.type) }" />{{ a.label }}
            <span class="chip-status" :style="{ color: STATUS_META[a.status].fg }">{{ STATUS_META[a.status].label }}</span>
          </button>
        </li>
      </ul>
      <p v-if="failed3d" class="notice">Tampilan 3D tidak tersedia ({{ failed3d }}), memakai tampilan 2D.</p>
    </div>

    <div v-if="exited" class="card ended" role="status">
      <div>
        <strong>Sesi berhenti{{ session?.exitCode ? ` (kode ${session.exitCode})` : '' }}.</strong>
        <span> Percakapannya tersimpan.</span>
        <span v-if="resumeError" class="err"> {{ resumeError }}</span>
      </div>
      <button v-if="canResume" type="button" class="resume" :disabled="resuming" @click="resume">{{ resuming ? 'Membuka…' : 'Lanjutkan sesi' }}</button>
      <button type="button" @click="leaveSession">Ke lobby</button>
    </div>

    <div v-if="dock.length" class="card dock">
      <button v-for="d in dock" :key="d.key" type="button" @click="restore(d.key)">
        <span class="dock-dot" :style="{ background: d.color }" />{{ d.label }}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
      </button>
    </div>

    <OverlayWindow
      :state="termWin"
      label="Terminal"
      dark
      :default-style="{ left: '16px', right: '16px', bottom: '16px', height: '26%' }"
      :max-inset="{ top: 16, right: 16, bottom: 16, left: 16 }"
      @update:state="Object.assign(termWin, $event)"
      @focus="termWin.z = ++zTop"
    >
      <template #header>
        <div class="tabs" role="tablist" aria-label="Tampilan log">
          <button type="button" role="tab" :aria-selected="tab === 'term'" :class="{ on: tab === 'term' }" @click="tab = 'term'">
            Terminal <small>Claude Code asli</small>
          </button>
          <button type="button" role="tab" :aria-selected="tab === 'log'" :class="{ on: tab === 'log' }" @click="tab = 'log'">
            Log terstruktur <small>per agent</small>
          </button>
        </div>
      </template>
      <TerminalPane v-show="tab === 'term'" :session-id="sessionId" :visible="tab === 'term' && termWin.mode !== 'min'" />
      <StructuredLog v-if="tab === 'log'" :session-id="sessionId" />
    </OverlayWindow>

    <OverlayWindow
      v-if="selected"
      :state="detailWin"
      :label="`Detail ${selected.label}`"
      :default-style="detailStyle"
      :max-inset="{ top: 16, right: 16, bottom: 16, left: 16 }"
      class="detail-win"
      :style="{ borderTop: `4px solid ${agentColor(selected.type)}` }"
      @update:state="Object.assign(detailWin, $event)"
      @focus="detailWin.z = ++zTop"
    >
      <template #header>
        <CharacterBlob :color="agentColor(selected.type)" :status="'idle'" :tag="agentTag(selected.type)" :size="30" class="mini" />
        <div class="dh">
          <h2>{{ selected.label }}</h2>
          <code>{{ selected.kind === 'lead' ? 'sesi utama' : selected.type }}</code>
        </div>
        <span class="pill" :style="{ background: STATUS_META[selected.status].bg, color: STATUS_META[selected.status].fg }">{{ STATUS_META[selected.status].label }}</span>
      </template>
      <AgentDetail :agent="selected" />
    </OverlayWindow>
  </div>
</template>

<style scoped>
.stage { position: relative; height: 100%; overflow: hidden; background: var(--night); }

.card { position: absolute; z-index: 20; background: rgba(255, 255, 255, 0.95); border-radius: 16px; box-shadow: 0 8px 24px rgba(20, 18, 30, 0.18); }
.session-card { left: 16px; top: 16px; width: min(440px, calc(100% - 32px)); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 10px; }
h1 { margin: 0; font-family: var(--font-display); font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: auto; }
.path { margin: 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.roster { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; max-height: 96px; overflow-y: auto; }
.roster-chip { min-height: 32px; padding: 0 10px; display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.roster-chip.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.roster-chip .dot { width: 9px; height: 9px; border-radius: 50%; }
.chip-status { font-weight: 500; }
.notice { margin: 4px 0 0; font-size: 12px; color: var(--st-wait-fg); }
.meta { margin-right: auto; font-size: 13px; color: var(--ink-2); }
.warn { color: var(--st-wait-fg); }
.music-toggle { margin-left: auto; width: 36px; min-height: 36px; height: 36px; }
.back { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
.pill { padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.pill.run { background: var(--st-tool-bg); color: var(--st-tool-fg); }
.pill.off { background: var(--st-idle-bg); color: var(--st-idle-fg); }
.stop { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; color: var(--st-error-fg); font-weight: 500; cursor: pointer; }
.stop:disabled { opacity: 0.6; cursor: default; }

.ended { left: 50%; top: 16px; transform: translateX(-50%); z-index: 30; display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; font-size: 14px; max-width: calc(100% - 940px); min-width: 360px; }
.ended button { min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; font-weight: 500; cursor: pointer; white-space: nowrap; }
.ended .resume { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.ended .err { color: var(--st-error-fg); }
.dock { right: 16px; top: 16px; padding: 8px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: calc(100% - 480px); }
.dock button { min-height: 44px; padding: 0 12px; display: flex; align-items: center; gap: 8px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; font-weight: 600; font-size: 13px; cursor: pointer; }
.dock-dot { width: 8px; height: 8px; border-radius: 50%; }

.tabs { display: flex; gap: 2px; }
.tabs button {
  min-height: 44px; padding: 0 12px; border: 0; border-bottom: 2px solid transparent; background: transparent;
  color: #a9a5b4; font-family: var(--font-display); font-size: 14px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
}
.tabs button.on { color: var(--term-fg); border-bottom-color: var(--term-accent); }
.tabs small { font-family: var(--font-sans); font-size: 11px; font-weight: 500; color: var(--term-muted); }

.mini { flex: none; margin-top: -12px; }
.dh { min-width: 0; margin-right: auto; }
.dh h2 { margin: 0; font-family: var(--font-display); font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dh code { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
</style>
