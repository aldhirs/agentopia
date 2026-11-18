<!-- The real Claude Code TUI, rendered with xterm.js and wired to the session's pty. -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { office } from '../stores/office';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const props = defineProps<{ sessionId: string; visible: boolean }>();
const api = window.office;

const host = ref<HTMLDivElement | null>(null);
let term: Terminal | undefined;
let fit: FitAddon | undefined;
let ro: ResizeObserver | undefined;
const offs: Array<() => void> = [];

function refit() {
  if (!term || !fit || !host.value) return;
  if (host.value.clientWidth < 40 || host.value.clientHeight < 20) return; // hidden/minimized
  fit.fit();
  api.resize(props.sessionId, term.cols, term.rows);
}

async function attach(sessionId: string) {
  if (!term) return;
  offs.splice(0).forEach((off) => off());
  term.reset();
  // Subscribe first, then replay the buffer; drop live chunks that arrive before the replay lands.
  let replayed = false;
  const pending: string[] = [];
  offs.push(api.onPtyData((id, data) => {
    if (id !== sessionId) return;
    if (replayed) term!.write(data); else pending.push(data);
  }));
  const buffer = await api.getBuffer(sessionId);
  term.write(buffer);
  replayed = true;
  pending.splice(0);
  refit();
}

onMounted(() => {
  term = new Terminal({
    allowProposedApi: true,
    cursorBlink: true,
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: office.settings?.terminalFontSize ?? 13,
    lineHeight: 1.2,
    scrollback: 10000,
    macOptionIsMeta: true,
    theme: {
      background: '#16151b',
      foreground: '#e8e6f0',
      cursor: '#e8e6f0',
      cursorAccent: '#16151b',
      selectionBackground: 'rgba(232, 160, 122, 0.35)',
      black: '#2a2833', brightBlack: '#6f6b7a',
      red: '#ff8a80', brightRed: '#ffaba4',
      green: '#7ee2a8', brightGreen: '#a5edc3',
      yellow: '#ffc27a', brightYellow: '#ffd6a3',
      blue: '#8fb3ff', brightBlue: '#b3cbff',
      magenta: '#d2a8ff', brightMagenta: '#e2c6ff',
      cyan: '#7fd8e8', brightCyan: '#a9e6f1',
      white: '#c9c6d3', brightWhite: '#ffffff',
    },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = '11';
  term.loadAddon(new WebLinksAddon((_e, uri) => window.open(uri, '_blank')));

  // Cmd+C copies the selection (otherwise it would be sent to the pty).
  term.attachCustomKeyEventHandler((e) => {
    if (e.type === 'keydown' && e.metaKey && e.key === 'c' && term!.hasSelection()) {
      navigator.clipboard.writeText(term!.getSelection());
      return false;
    }
    return true;
  });
  term.onData((d) => api.write(props.sessionId, d));
  term.open(host.value!);

  ro = new ResizeObserver(() => refit());
  ro.observe(host.value!);
  attach(props.sessionId);
});

watch(() => props.sessionId, (id) => attach(id));
watch(() => office.settings?.terminalFontSize, (size) => {
  if (term && size) { term.options.fontSize = size; refit(); }
});
watch(() => props.visible, (v) => { if (v) requestAnimationFrame(() => { refit(); term?.focus(); }); });

onBeforeUnmount(() => {
  offs.forEach((off) => off());
  ro?.disconnect();
  term?.dispose();
});

defineExpose({ focus: () => term?.focus() });
</script>

<template>
  <div ref="host" class="term-host" />
</template>

<style scoped>
.term-host { flex: 1; min-height: 0; padding: 8px 4px 4px 12px; background: var(--term-bg); }
.term-host :deep(.xterm) { height: 100%; }
.term-host :deep(.xterm-viewport) { background: var(--term-bg) !important; }
</style>
