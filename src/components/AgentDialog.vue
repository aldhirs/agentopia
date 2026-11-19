<!-- Create a Claude Code agent (.claude/agents/<name>.md) for this project or for all projects. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { FolderInfo, NewAgent } from '../../shared/types';
import CharacterBlob from './office/CharacterBlob.vue';
import { agentColor, agentTag } from '../lib/agentColor';

const props = defineProps<{ cwd: string | null }>();
const emit = defineEmits<{ close: []; created: [info: FolderInfo, name: string] }>();
const api = window.office;

const dialog = ref<HTMLDialogElement | null>(null);
const name = ref('');
const description = ref('');
const prompt = ref('');
const model = ref<NewAgent['model'] | ''>('');
const scope = ref<NewAgent['scope']>(props.cwd ? 'project' : 'user');
const saving = ref(false);
const error = ref('');

const folderName = computed(() => props.cwd?.split(/[\\/]/).filter(Boolean).pop() ?? '');
// Same rule as the main process: lowercase words joined by hyphens.
const cleanName = computed(() => name.value.replace(/-+$/, ''));
const nameOk = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanName.value) && cleanName.value.length >= 2);
const canSave = computed(() => nameOk.value && description.value.trim() && prompt.value.trim() && !saving.value);
const color = computed(() => agentColor(cleanName.value || 'agent-baru'));
const MODELS: Array<{ id: NewAgent['model'] | ''; label: string }> = [
  { id: '', label: 'Ikut sesi' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }, { id: 'haiku', label: 'Haiku' },
];
const where = computed(() => (scope.value === 'project'
  ? `${folderName.value}/.claude/agents/${cleanName.value || 'nama'}.md`
  : `~/.claude/agents/${cleanName.value || 'nama'}.md`));

/** Typing "Copy Writer" becomes "copy-writer". */
function tidyName() {
  name.value = name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 50);
}

onMounted(() => dialog.value?.showModal());

function close() {
  dialog.value?.close();
  emit('close');
}

async function save() {
  error.value = '';
  saving.value = true;
  try {
    const n = cleanName.value;
    const info = await api.createAgent({
      scope: scope.value, cwd: props.cwd ?? undefined, name: n,
      description: description.value, prompt: prompt.value, model: model.value || undefined,
    });
    emit('created', info, n);
    close();
  } catch (e) {
    error.value = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="agent-title" @cancel.prevent="close" @click.self="close">
    <form class="sheet" :style="{ '--c': color }" @submit.prevent="save">
      <aside class="stage" aria-label="Pratinjau agent">
        <div class="card">
          <CharacterBlob :color="color" status="idle" :tag="cleanName ? agentTag(cleanName) : '?'" :size="72" class="hero" />
          <span class="shadow" aria-hidden="true" />
          <p class="who">{{ cleanName || 'agent-baru' }}</p>
          <p class="handle">@agent-{{ cleanName || 'nama' }}</p>
          <p class="quote" :class="{ empty: !description.trim() }">{{ description.trim() || 'Kapan agent ini dipanggil akan muncul di sini.' }}</p>
          <ul class="facts">
            <li>{{ model ? `Model ${model}` : 'Model ikut sesi' }}</li>
            <li>{{ scope === 'project' ? `Hanya di ${folderName}` : 'Di semua project' }}</li>
          </ul>
        </div>
      </aside>

      <div class="form">
        <header>
          <h2 id="agent-title">Tambah agent</h2>
          <button type="button" class="icon" aria-label="Tutup" @click="close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div class="field">
          <label for="a-name">Nama</label>
          <input id="a-name" v-model="name" placeholder="copy-writer" maxlength="50" autocomplete="off" spellcheck="false" @input="tidyName" />
          <p class="hint">Huruf kecil, angka dan tanda hubung. Spasi otomatis jadi tanda hubung.</p>
        </div>

        <div class="field">
          <label for="a-desc">Kapan dipakai</label>
          <input id="a-desc" v-model="description" maxlength="500" placeholder="Menulis dan merapikan teks UI dalam bahasa Indonesia" />
          <p class="hint">Lead membaca ini untuk memutuskan kapan memanggil agent ini.</p>
        </div>

        <div class="field">
          <label for="a-prompt">Instruksi</label>
          <textarea id="a-prompt" v-model="prompt" rows="5" maxlength="20000" placeholder="Kamu penulis UI. Tulis singkat, jelas, dan pakai bahasa sehari-hari." />
        </div>

        <fieldset class="field">
          <legend>Model</legend>
          <div class="seg">
            <label v-for="m in MODELS" :key="m.label" :class="{ on: model === m.id }">
              <input v-model="model" type="radio" name="a-model" :value="m.id" />{{ m.label }}
            </label>
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>Simpan untuk</legend>
          <div class="places">
            <label :class="{ on: scope === 'project', disabled: !cwd }">
              <input v-model="scope" type="radio" name="a-scope" value="project" :disabled="!cwd" />
              <strong>Project ini</strong>
              <span>{{ cwd ? `Hanya muncul di ${folderName}, bisa ikut di-commit` : 'Pilih folder project dulu di lobby' }}</span>
            </label>
            <label :class="{ on: scope === 'user' }">
              <input v-model="scope" type="radio" name="a-scope" value="user" />
              <strong>Semua project</strong>
              <span>Muncul di semua project di laptop ini</span>
            </label>
          </div>
          <p class="hint path">{{ where }}</p>
        </fieldset>

        <p v-if="error" class="err" role="alert">{{ error }}</p>
        <div class="actions">
          <button type="button" class="secondary" @click="close">Batal</button>
          <button type="submit" class="primary" :disabled="!canSave">{{ saving ? 'Menyimpan…' : 'Simpan agent' }}</button>
        </div>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog { padding: 0; border: 0; border-radius: 22px; width: min(820px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: hidden; background: #fff; box-shadow: 0 28px 70px rgba(20, 18, 30, 0.4); }
.dialog::backdrop { background: rgba(40, 36, 52, 0.5); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.sheet { display: grid; grid-template-columns: 280px 1fr; max-height: calc(100vh - 32px); }

/* Left: the new agent standing on the office floor, updating as you type. */
.stage {
  display: flex; align-items: center; justify-content: center; padding: 28px 22px;
  background:
    radial-gradient(120% 60% at 50% 100%, color-mix(in srgb, var(--c) 30%, transparent), transparent 70%),
    repeating-linear-gradient(90deg, rgba(120, 86, 40, 0.07) 0 1px, transparent 1px 72px),
    linear-gradient(180deg, #f3ead9, var(--floor));
  transition: background 200ms ease;
}
.card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; width: 100%; }
.hero { margin-bottom: -6px; }
.shadow { width: 64px; height: 12px; border-radius: 50%; background: rgba(60, 40, 20, 0.18); filter: blur(2px); margin-bottom: 10px; }
.who { margin: 0; font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-size: 24px; font-weight: 600; line-height: 1.15; overflow-wrap: anywhere; }
.handle { margin: 0; font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }
.quote {
  position: relative; margin: 14px 0 0; padding: 10px 12px; border-radius: 14px; background: #fff; width: 100%;
  font-size: 13px; line-height: 1.45; color: var(--ink); box-shadow: 0 0 0 1.5px var(--c);
}
.quote::before { content: ''; position: absolute; left: 50%; top: -6px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); background: #fff; box-shadow: -1.5px -1.5px 0 0 var(--c); border-radius: 2px 0 0 0; }
.quote.empty { color: var(--ink-2); }
.facts { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.facts li { padding: 3px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.75); font-size: 12px; font-weight: 600; color: var(--ink-2); }

/* Right: the form. */
.form { display: flex; flex-direction: column; gap: 14px; padding: 20px 22px 20px; overflow-y: auto; }
header { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-size: 22px; font-weight: 600; }
.field { display: flex; flex-direction: column; gap: 6px; border: 0; margin: 0; padding: 0; min-width: 0; }
label, legend { font-size: 13px; font-weight: 600; padding: 0; }
.field > input, textarea { min-height: 42px; padding: 9px 13px; border-radius: 12px; border: 1.5px solid var(--line-2); background: #fff; font: inherit; font-size: 14px; color: var(--ink); }
#a-name { font-family: var(--font-mono); font-size: 13.5px; }
textarea { resize: vertical; line-height: 1.5; }
.field > input:focus, textarea:focus { outline: none; border-color: var(--c); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 25%, transparent); }
.hint { margin: 0; font-size: 12px; line-height: 1.4; color: var(--ink-2); }
.path { font-family: var(--font-mono); font-size: 11.5px; word-break: break-all; }
input[type='radio'] { position: absolute; opacity: 0; pointer-events: none; }
.seg { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 999px; background: var(--cream); width: fit-content; }
.seg label { padding: 6px 14px; border-radius: 999px; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--ink-2); }
.seg label.on { background: #fff; color: var(--ink); box-shadow: 0 1px 3px rgba(20, 18, 30, 0.15); }
.seg label:has(input:focus-visible), .places label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.places { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.places label { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border-radius: 14px; border: 1.5px solid var(--line); cursor: pointer; font-weight: 400; }
.places strong { font-size: 13.5px; }
.places span { font-size: 12px; line-height: 1.4; color: var(--ink-2); }
.places label.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 10%, #fff); }
.places label.disabled { opacity: 0.55; cursor: default; }
.err { margin: 0; font-size: 13px; color: var(--st-error-fg); }
.actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
button { min-height: 42px; padding: 0 18px; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.primary { background: var(--ink); color: #fff; border: 0; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25); }
.secondary { background: #fff; color: var(--ink); border: 1.5px solid var(--line-2); }
.icon { width: 40px; min-height: 40px; padding: 0; display: grid; place-items: center; border: 0; background: transparent; }
.icon:hover { background: var(--cream); }

@media (max-width: 720px) {
  .sheet { grid-template-columns: 1fr; overflow-y: auto; }
  .stage { padding: 18px; }
  .form { overflow: visible; }
  .places { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .stage { transition: none; } }
</style>
