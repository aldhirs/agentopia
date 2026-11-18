<!-- A desk with its character, monitor, name and status. `bare` = no desk (pantry). -->
<script setup lang="ts">
import { computed } from 'vue';
import type { AgentState } from '../../../shared/types';
import CharacterBlob from './CharacterBlob.vue';
import { agentColor, agentTag } from '../../lib/agentColor';
import { STATUS_META } from '../../lib/status';

const props = defineProps<{ agent: AgentState; selected: boolean; bare?: boolean; big?: boolean }>();
defineEmits<{ select: [id: string] }>();

const meta = computed(() => STATUS_META[props.agent.status]);
const screen = computed(() => {
  switch (props.agent.status) {
    case 'tool_use': return '#8FD3FF';
    case 'error': return '#F59A8F';
    case 'idle': return '#3A3842';
    default: return '#C9D6FF';
  }
});
</script>

<template>
  <button
    type="button"
    class="desk"
    :class="{ selected, bare, big }"
    :aria-label="`${agent.label}, ${meta.label}`"
    :aria-pressed="selected"
    @click="$emit('select', agent.id)"
  >
    <div class="scene">
      <div class="enter">
        <CharacterBlob :color="agentColor(agent.type, agent.id)" :status="agent.status" :tag="agentTag(agent.type)" :size="bare ? 46 : 56" />
      </div>
      <div v-if="!bare" class="monitor"><div class="screen" :class="{ on: agent.status === 'tool_use' }" :style="{ background: screen }" /></div>
    </div>
    <div v-if="!bare" class="top" />
    <div class="name-row">
      <span class="name">{{ agent.label }}</span>
      <span class="pill" :style="{ background: meta.bg, color: meta.fg }">{{ meta.label }}</span>
    </div>
    <span class="activity mono">{{ agent.activity ?? '' }}</span>
  </button>
</template>

<style scoped>
.desk {
  width: 200px; padding: 8px 8px 10px; display: flex; flex-direction: column; align-items: center; gap: 5px;
  background: rgba(255, 255, 255, 0.45); border: 2px solid transparent; border-radius: 16px; cursor: pointer;
  transition: background 0.15s;
}
.desk:hover { background: rgba(255, 255, 255, 0.7); }
.desk.selected { background: rgba(255, 255, 255, 0.88); border-color: var(--ink); }
.desk.big { width: 220px; }
.desk.bare { width: 150px; background: rgba(255, 255, 255, 0.35); }
.scene { position: relative; width: 176px; height: 86px; }
.bare .scene { width: 120px; height: 72px; }
.enter { position: absolute; left: 24px; bottom: 0; animation: enter 0.7s cubic-bezier(0.3, 1.4, 0.6, 1) both; }
.bare .enter { left: 50%; margin-left: -23px; }
.monitor { position: absolute; right: 22px; bottom: 0; width: 56px; height: 38px; border-radius: 6px; background: #2a2833; padding: 4px; }
.screen { width: 100%; height: 100%; border-radius: 3px; }
.screen.on { animation: flicker 1.4s steps(2) infinite; }
.top { width: 184px; height: 16px; border-radius: 5px; background: #b89b6e; }
.big .top { width: 204px; }
.name-row { display: flex; align-items: center; gap: 6px; max-width: 100%; }
.name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink); }
.pill { padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.activity { max-width: 100%; font-size: 11px; color: #4a4853; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.3em; }
@keyframes enter { from { opacity: 0; transform: translateY(30px) scale(0.6); } to { opacity: 1; transform: none; } }
@keyframes flicker { 0% { opacity: 1; } 50% { opacity: 0.75; } }
</style>
