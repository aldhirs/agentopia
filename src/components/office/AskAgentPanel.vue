<!-- Ask one agent directly: through the running session (`@agent-<name> …`, the Lead calls it and the
     answer shows in the terminal), or in a separate chat (`claude --agent <name>`, its own office). -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FolderInfo, SessionInfo, TeamMember } from '../../../shared/types';
import AgentDialog from '../AgentDialog.vue';
import AgentLineup from './AgentLineup.vue';
import CharacterBlob from './CharacterBlob.vue';
import { office, openSession } from '../../stores/office';
import { agentColor, agentTag } from '../../lib/agentColor';

const props = defineProps<{ session: SessionInfo; agent: string | null }>();
const emit = defineEmits<{ sent: [] }>();
const api = window.office;

const team = ref<TeamMember[]>([]);
const chosen = ref<string>(props.agent ?? '');
const text = ref('');
const busy = ref<'ask' | 'chat' | null>(null);
const error = ref('');
const sent = ref('');
const showNew = ref(false);

async function loadTeam(info?: FolderInfo) {
  const f = info ?? await api.folderInfo(props.session.cwd);
  team.value = f.team;
  if (!chosen.value || !f.team.some((m) => m.name === chosen.value)) chosen.value = f.team[0]?.name ?? '';
}
void loadTeam();
watch(() => props.agent, (a) => { if (a) chosen.value = a; });

const member = computed(() => team.value.find((m) => m.name === chosen.value));
const state = computed(() => office.states[props.session.id]);
const running = computed(() => props.session.status === 'running');
const waiting = computed(() => !!state.value && Object.values(state.value.agents).some((a) => a.status === 'waiting'));
const askBlocked = computed(() => {
  if (!running.value) return 'Sesi ini sudah berhenti. Pakai chat terpisah.';
  if (waiting.value) return 'Ada agent yang minta izin. Jawab dulu di terminal.';
  return '';
});
const SOURCE: Record<TeamMember['source'], string> = { builtin: 'Bawaan Claude Code', user: 'Agent untuk semua project', project: 'Agent project ini' };

const submitKey = /Mac/i.test(navigator.platform) ? '⌘↵' : 'Ctrl+↵';
const clean = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

async function ask() {
  if (!chosen.value || !text.value.trim()) return;
  error.value = '';
  sent.value = '';
  busy.value = 'ask';
  try {
    await api.askAgent(props.session.id, chosen.value, text.value);
    sent.value = `Terkirim ke ${chosen.value}. Jawabannya muncul di terminal dan di detail agent.`;
    text.value = '';
    emit('sent');
  } catch (e) {
    error.value = clean(e);
  } finally {
    busy.value = null;
  }
}

async function chatSeparately() {
  if (!chosen.value) return;
  error.value = '';
  busy.value = 'chat';
  try {
    const s = props.session;
    const info = await api.startSession({
      cwd: s.cwd,
      agent: chosen.value,
      name: chosen.value,
      prompt: text.value.trim() || undefined,
      permissionMode: s.permissionMode === 'inherit' ? undefined : s.permissionMode,
    });
    text.value = '';
    await openSession(info.id);
  } catch (e) {
    error.value = clean(e);
  } finally {
    busy.value = null;
  }
}

function created(info: FolderInfo, name: string) {
  void loadTeam(info);
  chosen.value = name;
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void ask(); }
}
</script>

<template>
  <div class="ask">
    <AgentLineup v-model="chosen" :team="team" label="Pilih agent" @add="showNew = true" />

    <div v-if="member" class="talk" :style="{ '--c': agentColor(member.name) }">
      <div class="who">
        <CharacterBlob :color="agentColor(member.name)" status="idle" :tag="agentTag(member.name)" :size="40" />
        <div class="who-text">
          <h3>{{ member.name }}</h3>
          <p class="src">{{ SOURCE[member.source] }}</p>
        </div>
      </div>
      <p class="desc" :title="member.description">{{ member.description || 'Belum ada deskripsi kapan agent ini dipakai.' }}</p>

      <label class="bubble">
        <span class="sr">Pertanyaan untuk {{ member.name }}</span>
        <textarea v-model="text" rows="3" maxlength="20000" :placeholder="`Mau tanya apa ke ${member.name}?`" @keydown="onKey" />
      </label>

      <p v-if="error" class="msg err" role="alert">{{ error }}</p>
      <p v-else-if="sent" class="msg ok" role="status">{{ sent }}</p>
      <p v-else-if="askBlocked" class="msg note">{{ askBlocked }}</p>

      <div class="actions">
        <button type="button" class="primary" :disabled="!!askBlocked || !text.trim() || !!busy" @click="ask">
          {{ busy === 'ask' ? 'Mengirim…' : 'Tanya di sesi ini' }}<kbd>{{ submitKey }}</kbd>
        </button>
        <button type="button" class="secondary" :disabled="!!busy" @click="chatSeparately">
          {{ busy === 'chat' ? 'Membuka kantor…' : 'Chat terpisah' }}
        </button>
      </div>
      <dl class="explain">
        <div><dt>Tanya di sesi ini</dt><dd>Lead memanggil {{ member.name }}; jawabannya masuk ke percakapan sesi ini.</dd></div>
        <div><dt>Chat terpisah</dt><dd>Kantor baru, kamu ngobrol langsung dengan {{ member.name }} dengan konteks sendiri.</dd></div>
      </dl>
    </div>
    <AgentDialog v-if="showNew" :cwd="session.cwd" @close="showNew = false" @created="created" />
  </div>
</template>

<style scoped>
.ask { display: flex; flex-direction: column; gap: 12px; padding: 12px 14px 16px; overflow-y: auto; }
.talk { display: flex; flex-direction: column; gap: 10px; }
.who { display: flex; align-items: flex-end; gap: 10px; }
.who-text { padding-bottom: 4px; min-width: 0; }
h3 { margin: 0; font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-size: 19px; font-weight: 600; line-height: 1.15; overflow-wrap: anywhere; }
.src { margin: 2px 0 0; font-size: 12px; color: var(--ink-2); }
.desc { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
/* The question is a speech bubble pointing at the picked character. */
.bubble { position: relative; display: block; margin-top: 6px; }
.bubble::before {
  content: ''; position: absolute; left: 16px; top: -7px; width: 14px; height: 14px; transform: rotate(45deg);
  background: #fff; border-left: 1.5px solid var(--c); border-top: 1.5px solid var(--c); border-radius: 3px 0 0 0;
}
textarea {
  display: block; width: 100%; min-height: 84px; padding: 11px 13px; border-radius: 16px; border: 1.5px solid var(--c);
  background: #fff; font: inherit; font-size: 14px; line-height: 1.5; resize: vertical; color: var(--ink);
}
textarea:focus { outline: none; box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 28%, transparent); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
button { min-height: 40px; padding: 0 16px; border-radius: 999px; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.primary { background: var(--ink); color: #fff; border: 0; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25); }
.primary kbd { font-family: var(--font-sans); font-size: 11px; font-weight: 500; opacity: 0.6; }
.secondary { background: #fff; color: var(--ink); border: 1.5px solid var(--line-2); }
.secondary:hover:not(:disabled) { border-color: var(--ink); }
.msg { margin: 0; font-size: 12.5px; line-height: 1.45; }
.err { color: var(--st-error-fg); }
.ok { color: var(--st-done-fg); }
.note { color: var(--st-wait-fg); }
.explain { margin: 2px 0 0; display: grid; gap: 6px; }
.explain div { display: grid; grid-template-columns: 112px 1fr; gap: 8px; font-size: 12px; line-height: 1.45; }
.explain dt { font-weight: 600; color: var(--ink); }
.explain dd { margin: 0; color: var(--ink-2); }
</style>
