<!-- The team as characters standing on the office floor: pick one by clicking it.
     The picked one steps forward onto a spot of its own color. -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TeamMember } from '../../../shared/types';
import CharacterBlob from './CharacterBlob.vue';
import { agentColor, agentTag } from '../../lib/agentColor';

const props = defineProps<{ team: TeamMember[]; modelValue: string; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [string]; add: [] }>();

const query = ref('');
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? props.team.filter((m) => m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)) : props.team;
});

/** Lets long names wrap after a hyphen ("backend-\nengineer") instead of being cut off. */
const breakable = (name: string) => name.replace(/-/g, '-\u200b');

/** Arrow keys move through the lineup like a radio group. */
function onKey(e: KeyboardEvent, i: number) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const next = shown.value[(i + step + shown.value.length) % shown.value.length];
  if (!next) return;
  emit('update:modelValue', next.name);
  (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-name="${CSS.escape(next.name)}"]`)?.focus();
}
</script>

<template>
  <div class="lineup">
    <input v-if="team.length > 8" v-model="query" class="find" type="search" :placeholder="`Cari di ${team.length} agent`" aria-label="Cari agent" />
    <div class="floor" role="radiogroup" :aria-label="label">
      <button
        v-for="(m, i) in shown" :key="m.name" type="button" role="radio" class="who"
        :data-name="m.name" :aria-checked="m.name === modelValue" :tabindex="m.name === modelValue || (!modelValue && i === 0) ? 0 : -1"
        :title="m.description ? `${m.name}: ${m.description}` : m.name"
        :style="{ '--c': agentColor(m.name) }"
        @click="emit('update:modelValue', m.name)" @keydown="onKey($event, i)"
      >
        <span class="spot" aria-hidden="true" />
        <CharacterBlob :color="agentColor(m.name)" status="idle" :tag="agentTag(m.name)" :size="34" class="blob" />
        <span class="name">{{ breakable(m.name) }}</span>
      </button>
      <button type="button" class="who hire" @click="emit('add')">
        <span class="plus" aria-hidden="true">+</span>
        <span class="name">Agent baru</span>
      </button>
      <p v-if="!shown.length" class="none">Tidak ada agent bernama "{{ query }}".</p>
    </div>
  </div>
</template>

<style scoped>
.lineup { display: flex; flex-direction: column; gap: 8px; }
.find { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line-2); background: #fff; font: inherit; font-size: 13px; }
/* Warm wood floor with faint planks, like the office floor in 3D. */
.floor {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 4px; align-items: start;
  padding: 10px 8px 6px; border-radius: 14px; max-height: 252px; overflow-y: auto;
  background:
    repeating-linear-gradient(90deg, rgba(120, 86, 40, 0.07) 0 1px, transparent 1px 64px),
    linear-gradient(180deg, #efe4cf, var(--floor));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), inset 0 -2px 0 rgba(120, 86, 40, 0.12);
}
.who {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 4px 2px 6px; border: 0; border-radius: 12px; background: transparent; cursor: pointer; color: var(--ink);
  transition: transform 160ms ease;
}
.who:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.blob { transition: transform 180ms cubic-bezier(.3, 1.6, .5, 1); }
.spot {
  position: absolute; left: 50%; top: 38px; width: 46px; height: 14px; border-radius: 50%;
  transform: translateX(-50%) scale(0.6); background: var(--c); opacity: 0; filter: blur(3px);
  transition: opacity 160ms ease, transform 160ms ease;
}
.who:hover .blob { transform: translateY(-2px); }
.who[aria-checked='true'] .blob { transform: translateY(-5px) scale(1.06); }
.who[aria-checked='true'] .spot { opacity: 0.7; transform: translateX(-50%) scale(1); }
.name {
  max-width: 100%; padding: 1px 7px; border-radius: 8px; font-size: 11px; font-weight: 600; line-height: 1.3; text-align: center;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
  background: rgba(255, 255, 255, 0.72);
}
.who[aria-checked='true'] .name { background: #fff; box-shadow: 0 0 0 1.5px var(--c); }
.hire .plus {
  width: 34px; height: 40px; margin-top: 11px; display: grid; place-items: center; border-radius: 16px 16px 12px 12px;
  border: 1.5px dashed rgba(74, 69, 85, 0.45); color: var(--wall); font-size: 20px; font-weight: 500;
}
.hire:hover .plus { border-color: var(--accent); color: var(--accent); }
.none { grid-column: 1 / -1; margin: 6px 4px; font-size: 12.5px; color: var(--ink-2); }
@media (prefers-reduced-motion: reduce) { .who, .blob, .spot { transition: none; } }
</style>
