<!-- Body of the character detail window: task from the lead, activity log, permission notice. -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AgentState } from '../../../shared/types';

const props = defineProps<{ agent: AgentState }>();
const box = ref<HTMLElement | null>(null);

const entries = computed(() => props.agent.log.slice(-200));
const CHIP: Record<string, [string, string]> = {
  Agent: ['#EEF0FF', '#26318F'], Bash: ['#FCE9C2', '#7A4B00'], Edit: ['#D7F2DF', '#166534'],
  Write: ['#D7F2DF', '#166534'], Read: ['#E7E4DE', '#3A3842'], Grep: ['#E7E4DE', '#3A3842'], Glob: ['#E7E4DE', '#3A3842'],
};
const chip = (tool?: string) => CHIP[tool ?? ''] ?? ['#E7E4DE', '#3A3842'];
const time = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit' });

watch(() => entries.value.length, async () => {
  await nextTick();
  if (box.value) box.value.scrollTop = box.value.scrollHeight;
}, { immediate: true });
</script>

<template>
  <div ref="box" class="detail">
    <div v-if="agent.description" class="task">
      <p class="task-label">Tugas dari Lead</p>
      <p class="task-text">{{ agent.description }}</p>
    </div>

    <ol class="entries">
      <li v-for="(e, i) in entries" :key="i">
        <div v-if="e.kind === 'tool'" class="tool">
          <span class="chip" :style="{ background: chip(e.tool)[0], color: chip(e.tool)[1] }">{{ e.tool }}</span>
          <span class="tool-text">{{ e.text }}</span>
          <span class="t">{{ time(e.at) }}</span>
        </div>
        <div v-else-if="e.kind === 'user'" class="bubble user">{{ e.text }}</div>
        <div v-else-if="e.kind === 'text'" class="bubble">{{ e.text }}</div>
        <div v-else class="status-line">{{ e.text }} · {{ time(e.at) }}</div>
      </li>
      <li v-if="!entries.length" class="status-line">Belum ada aktivitas.</li>
    </ol>

    <div v-if="agent.status === 'waiting'" class="perm">
      <p class="perm-title">{{ agent.label }} minta izin</p>
      <p class="mono perm-cmd">{{ agent.activity?.replace(/^Izin · /, '') }}</p>
      <p class="perm-hint">Jawab di jendela Terminal (pilih 1, 2, atau 3).</p>
    </div>
  </div>
  <p v-if="agent.kind === 'subagent'" class="foot">
    Subagent menerima tugas dari Lead dan melapor balik ke Lead. Instruksi tambahan dikirim lewat Terminal.
  </p>
</template>

<style scoped>
.detail { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.task { margin: 14px 14px 0; padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); }
.task-label { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--accent-ink); }
.task-text { margin: 0; font-size: 13px; line-height: 1.45; }
.entries { list-style: none; margin: 0; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.tool { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px dashed var(--line-2); border-radius: 10px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); }
.chip { flex: none; padding: 2px 6px; border-radius: 6px; font-weight: 600; }
.tool-text { min-width: 0; margin-right: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.t { flex: none; color: var(--muted); }
.bubble { max-width: 92%; padding: 9px 12px; border-radius: 14px 14px 14px 4px; background: var(--cream); font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.bubble.user { margin-left: auto; border-radius: 14px 14px 4px 14px; background: var(--ink); color: #fff; }
.status-line { font-size: 12px; color: var(--muted); }
.perm { margin: 0 14px 14px; padding: 12px; border-radius: 12px; background: #fff4ec; border: 1px solid #f6c9a8; }
.perm-title { margin: 0 0 6px; font-size: 13px; font-weight: 600; color: var(--st-wait-fg); }
.perm-cmd { margin: 0 0 6px; padding: 8px 10px; border-radius: 8px; background: var(--term-bg); color: var(--term-fg); font-size: 12px; word-break: break-all; }
.perm-hint { margin: 0; font-size: 12px; color: var(--muted); }
.foot { margin: 0; padding: 10px 14px 12px; border-top: 1px solid #eeeae3; font-size: 12px; line-height: 1.5; color: var(--muted); }
</style>
