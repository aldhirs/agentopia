<!-- One session = one office. Phase 2: office placeholder + Terminal window (Terminal / Log tabs).
     The office floor and character detail window arrive in Phase 3. -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import OverlayWindow, { type WinState } from '../components/OverlayWindow.vue';
import TerminalPane from '../components/TerminalPane.vue';
import StructuredLog from '../components/StructuredLog.vue';
import { leaveSession, office } from '../stores/office';
import { agentColor } from '../lib/agentColor';
import { STATUS_META } from '../lib/status';

const props = defineProps<{ sessionId: string }>();
const api = window.office;

const session = computed(() => office.sessions.find((s) => s.id === props.sessionId));
const state = computed(() => office.states[props.sessionId]);
const agents = computed(() => (state.value ? state.value.order.map((id) => state.value!.agents[id]) : []));

const tab = ref<'term' | 'log'>('term');
const termWin = reactive<WinState>({ mode: 'normal', pos: null, z: 10 });
let zTop = 10;
const focusTerm = () => { termWin.z = ++zTop; };
const setTermWin = (s: WinState) => Object.assign(termWin, s);

const dock = computed(() => (termWin.mode === 'min' ? [{ key: 'term', label: 'Terminal' }] : []));
const restore = (key: string) => { if (key === 'term') termWin.mode = 'normal'; };

const stopping = ref(false);
async function stop() {
  stopping.value = true;
  try { await api.stopSession(props.sessionId); } finally { stopping.value = false; }
}
</script>

<template>
  <div class="stage">
    <div class="floor" aria-hidden="true" />

    <div class="placeholder" role="region" aria-label="Kantor">
      <p class="ph-title">Kantor</p>
      <p class="ph-sub">Lantai kantor dan karakter dibangun di Phase 3. Sementara, status agent tampil di sini.</p>
      <ul class="roster">
        <li v-for="a in agents" :key="a.id">
          <span class="blob" :style="{ background: agentColor(a.type, a.id) }" />
          <span class="name">{{ a.label }}</span>
          <span class="pill" :style="{ background: STATUS_META[a.status].bg, color: STATUS_META[a.status].fg }">{{ STATUS_META[a.status].label }}</span>
          <span class="act mono">{{ a.activity }}</span>
        </li>
      </ul>
    </div>

    <div class="card session-card">
      <div class="row">
        <button type="button" class="back" aria-label="Kembali ke lobby" @click="leaveSession">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1>Sesi · {{ session?.name }}</h1>
      </div>
      <p class="mono path">{{ session?.cwd }}</p>
      <div class="row">
        <span class="pill" :class="session?.status === 'running' ? 'run' : 'off'">{{ session?.status === 'running' ? 'Berjalan' : 'Selesai' }}</span>
        <button v-if="session?.status === 'running'" type="button" class="stop" :disabled="stopping" @click="stop">
          {{ stopping ? 'Menghentikan…' : 'Hentikan sesi' }}
        </button>
      </div>
    </div>

    <div v-if="dock.length" class="card dock">
      <button v-for="d in dock" :key="d.key" type="button" @click="restore(d.key)">
        <span class="dock-dot" />{{ d.label }}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
      </button>
    </div>

    <OverlayWindow
      :state="termWin"
      label="Terminal"
      dark
      :default-style="{ left: '16px', right: '16px', bottom: '16px', height: '42%' }"
      :max-inset="{ top: 16, right: 16, bottom: 16, left: 16 }"
      @update:state="setTermWin"
      @focus="focusTerm"
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
  </div>
</template>

<style scoped>
.stage { position: relative; height: 100%; overflow: hidden; background: var(--night); }
.floor {
  position: absolute; inset: 0;
  background-color: var(--floor);
  background-image: repeating-linear-gradient(90deg, rgba(120, 90, 50, 0.07) 0 2px, transparent 2px 72px);
}
.placeholder { position: absolute; left: 50%; top: 18%; transform: translateX(-50%); width: min(640px, calc(100% - 64px)); text-align: center; }
.ph-title { margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 600; color: #6b5d45; }
.ph-sub { margin: 6px 0 16px; font-size: 13px; color: #6b5d45; }
.roster { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; text-align: left; }
.roster li { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px; background: rgba(255, 255, 255, 0.7); }
.blob { width: 26px; height: 24px; border-radius: 46% 46% 40% 40%; flex: none; }
.name { font-weight: 600; font-size: 14px; }
.act { margin-left: auto; font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 50%; }
.pill { padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }

.card { position: absolute; z-index: 20; background: rgba(255, 255, 255, 0.95); border-radius: 16px; box-shadow: 0 8px 24px rgba(20, 18, 30, 0.18); }
.session-card { left: 16px; top: 16px; width: min(420px, calc(100% - 32px)); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 10px; }
h1 { margin: 0; font-family: var(--font-display); font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.path { margin: 0; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.back { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
.pill.run { background: var(--st-tool-bg); color: var(--st-tool-fg); }
.pill.off { background: var(--st-idle-bg); color: var(--st-idle-fg); }
.stop { min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; color: var(--st-error-fg); font-weight: 500; cursor: pointer; }
.stop:disabled { opacity: 0.6; cursor: default; }

.dock { right: 16px; top: 16px; padding: 8px; display: flex; gap: 8px; }
.dock button { min-height: 44px; padding: 0 12px; display: flex; align-items: center; gap: 8px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; font-weight: 600; font-size: 13px; cursor: pointer; }
.dock-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--term-accent); }

.tabs { display: flex; gap: 2px; }
.tabs button {
  min-height: 44px; padding: 0 12px; border: 0; border-bottom: 2px solid transparent; background: transparent;
  color: #a9a5b4; font-family: var(--font-display); font-size: 14px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
}
.tabs button.on { color: var(--term-fg); border-bottom-color: var(--term-accent); }
.tabs small { font-family: var(--font-sans); font-size: 11px; font-weight: 500; color: var(--term-muted); }
</style>
