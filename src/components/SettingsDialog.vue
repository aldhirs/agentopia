<!-- App settings: claude location, motion, terminal font size, notifications. -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { office, recheckClaude, updateSettings } from '../stores/office';

const emit = defineEmits<{ close: [] }>();
const api = window.office;

const dialog = ref<HTMLDialogElement | null>(null);
const claudePath = ref(office.settings?.claudePath ?? '');
const saving = ref(false);

onMounted(() => dialog.value?.showModal());

async function pickClaude() {
  const f = await api.pickFile();
  if (f) claudePath.value = f;
}

async function saveClaudePath() {
  saving.value = true;
  try { await updateSettings({ claudePath: claudePath.value }); } finally { saving.value = false; }
}

async function autoDetect() {
  claudePath.value = '';
  await saveClaudePath();
}

function close() {
  dialog.value?.close();
  emit('close');
}
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="settings-title" @cancel.prevent="close" @click.self="close">
    <div class="box">
      <header>
        <h2 id="settings-title">Pengaturan</h2>
        <button type="button" class="icon" aria-label="Tutup pengaturan" @click="close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>

      <section>
        <h3>Claude Code</h3>
        <p v-if="office.claude?.found" class="ok">Ditemukan: <code>{{ office.claude.path }}</code> · versi {{ office.claude.version }}
          · {{ office.claude.loggedIn ? 'sudah login' : 'belum login' }}</p>
        <p v-else-if="office.claude" class="bad">{{ office.claude.error }}</p>
        <label for="s-claude">Lokasi <code>claude</code> <span class="opt">(kosongkan untuk mencari otomatis)</span></label>
        <div class="inline">
          <input id="s-claude" v-model="claudePath" class="mono" placeholder="otomatis" />
          <button type="button" @click="pickClaude">Pilih…</button>
        </div>
        <div class="inline">
          <button type="button" class="primary" :disabled="saving" @click="saveClaudePath">Simpan & cek</button>
          <button type="button" :disabled="saving" @click="autoDetect">Cari otomatis</button>
          <button type="button" :disabled="saving" @click="recheckClaude">Cek ulang login</button>
        </div>
      </section>

      <section>
        <h3>Tampilan</h3>
        <div class="seg" role="radiogroup" aria-label="Tampilan kantor">
          <label class="toggle"><input type="radio" name="view" value="3d" :checked="office.settings?.officeView !== '2d'" @change="updateSettings({ officeView: '3d' })" /> Kantor 3D (startup)</label>
          <label class="toggle"><input type="radio" name="view" value="2d" :checked="office.settings?.officeView === '2d'" @change="updateSettings({ officeView: '2d' })" /> Kantor 2D (lebih ringan)</label>
        </div>
        <label class="toggle">
          <input type="checkbox" :checked="office.settings?.reduceMotion" @change="updateSettings({ reduceMotion: ($event.target as HTMLInputElement).checked })" />
          Kurangi animasi (karakter diam, kamera tidak bergerak sendiri)
        </label>
        <label for="s-font">Ukuran font terminal: {{ office.settings?.terminalFontSize }} px</label>
        <input
          id="s-font" type="range" min="10" max="20" step="1"
          :value="office.settings?.terminalFontSize"
          @change="updateSettings({ terminalFontSize: Number(($event.target as HTMLInputElement).value) })"
        />
      </section>

      <section>
        <h3>Notifikasi</h3>
        <label class="toggle">
          <input type="checkbox" :checked="office.settings?.notifications" @change="updateSettings({ notifications: ($event.target as HTMLInputElement).checked })" />
          Beri tahu saat agent minta izin atau Lead selesai (hanya saat app tidak sedang dibuka)
        </label>
        <p class="opt">Jumlah agent yang menunggu izin juga tampil sebagai badge di ikon Dock.</p>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
.dialog { padding: 0; border: 0; border-radius: 18px; width: min(560px, calc(100% - 32px)); box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35); }
.dialog::backdrop { background: rgba(28, 27, 34, 0.45); }
.box { padding: 20px 22px 24px; display: flex; flex-direction: column; gap: 18px; }
header { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-family: var(--font-display); font-size: 20px; }
h3 { margin: 0 0 8px; font-size: 14px; }
section { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid #eeeae3; }
label { font-size: 13px; font-weight: 600; }
.opt { font-weight: 400; color: var(--muted); font-size: 12px; margin: 0; }
p { margin: 0; font-size: 13px; line-height: 1.45; word-break: break-all; }
.ok { color: var(--st-done-fg); }
.bad { color: var(--st-error-fg); }
.inline { display: flex; flex-wrap: wrap; gap: 8px; }
input:not([type]) , input.mono { flex: 1; min-width: 0; min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line-2); font-family: var(--font-mono); font-size: 12.5px; }
input[type='range'] { width: 100%; accent-color: var(--accent); }
.toggle { display: flex; align-items: center; gap: 10px; font-weight: 500; min-height: 36px; }
.toggle input { width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
button { min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line-2); background: #fff; font-size: 13px; font-weight: 500; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: default; }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.icon { width: 40px; padding: 0; display: grid; place-items: center; border: 0; }
</style>
