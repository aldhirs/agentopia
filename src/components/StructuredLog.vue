<!-- "Log terstruktur": hook events as readable lines, filterable per agent. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { formatHook, type LogKind, type LogLine } from '../../shared/logFormat';
import { office } from '../stores/office';
import { agentColor } from '../lib/agentColor';

const props = defineProps<{ sessionId: string }>();

const filter = ref<string>('all');
const box = ref<HTMLElement | null>(null);

const state = computed(() => office.states[props.sessionId]);
const lines = computed<LogLine[]>(() =>
  (office.hooks[props.sessionId] ?? []).map(formatHook).filter((l): l is LogLine => l !== null));

const agentsSeen = computed(() => {
  const ids = new Set(lines.value.map((l) => l.agentId));
  return (state.value?.order ?? ['lead']).filter((id) => ids.has(id));
});
const label = (id: string) => state.value?.agents[id]?.label ?? (id === 'lead' ? 'Lead' : id.slice(0, 6));
const color = (id: string) => agentColor(state.value?.agents[id]?.type ?? 'lead', id);

const visible = computed(() => {
  const list = filter.value === 'all' ? lines.value : lines.value.filter((l) => l.agentId === filter.value);
  return list.slice(-1500);
});

const KIND_COLOR: Record<LogKind, string> = {
  info: '#e8e6f0', cmd: '#e8e6f0', out: '#a9a5b4', ok: '#7ee2a8', err: '#ff8a80', warn: '#ffc27a',
};
const time = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour12: false });

watch(() => visible.value.length, async () => {
  const el = box.value;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  await nextTick();
  if (atBottom) el.scrollTop = el.scrollHeight;
});

defineExpose({ filter });
</script>

<template>
  <div class="log-wrap">
    <div class="filters" role="group" aria-label="Filter log per agent">
      <button type="button" :aria-pressed="filter === 'all'" :class="{ on: filter === 'all' }" @click="filter = 'all'">
        <span class="dot" style="background: #e8e6f0" />semua
      </button>
      <button
        v-for="id in agentsSeen" :key="id" type="button"
        :aria-pressed="filter === id" :class="{ on: filter === id }" @click="filter = id"
      >
        <span class="dot" :style="{ background: color(id) }" />{{ label(id).toLowerCase() }}
      </button>
    </div>
    <div ref="box" class="log" role="log" aria-label="Log terstruktur">
      <div v-for="(l, i) in visible" :key="i" class="line">
        <span class="t">{{ time(l.at) }}</span>
        <span class="who" :style="{ color: color(l.agentId) }">[{{ label(l.agentId).toLowerCase() }}]</span>
        <span class="txt" :style="{ color: KIND_COLOR[l.kind] }">{{ l.text }}</span>
      </div>
      <p v-if="!visible.length" class="empty">Belum ada aktivitas.</p>
    </div>
  </div>
</template>

<style scoped>
.log-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--term-bg); }
.filters { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px 0; }
.filters button {
  min-height: 30px; padding: 0 10px; display: flex; align-items: center; gap: 6px;
  border-radius: 8px; border: 1px solid #4a4757; background: transparent; color: #c9c6d3;
  font-family: var(--font-mono); font-size: 12px; cursor: pointer;
}
.filters button.on { background: #e8e6f0; border-color: #e8e6f0; color: var(--term-bg); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.log { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 14px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.65; }
.line { display: flex; gap: 10px; white-space: pre-wrap; }
.t { flex: none; color: #8d8999; }
.who { flex: none; min-width: 90px; }
.txt { min-width: 0; word-break: break-word; }
.empty { color: var(--term-muted); margin: 0; }
</style>
