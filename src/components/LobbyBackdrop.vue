<!-- Lobby background: the 3D office with the folder's team hanging out, slowly orbiting.
     Purely decorative (aria-hidden, no pointer events). Falls back to a colourful gradient
     when 2D is chosen in settings or WebGL is unavailable. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AgentState, AgentStatus, OfficeState, TeamMember } from '../../shared/types';
import { OfficeEngine } from '../office3d/engine';
import { office } from '../stores/office';

const props = defineProps<{ team: TeamMember[] }>();

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const failed = ref(false);
const use3d = computed(() => office.settings?.officeView !== '2d' && !failed.value);
let engine: OfficeEngine | null = null;
let ro: ResizeObserver | undefined;

// A relaxed lobby: a few people "thinking", the rest idle; builtin agents included as robots.
const MOODS: AgentStatus[] = ['idle', 'thinking', 'idle', 'tool_use', 'idle', 'done', 'thinking', 'idle'];
function lobbyState(): OfficeState {
  const agents: Record<string, AgentState> = {
    lead: { id: 'lead', kind: 'lead', type: 'lead', label: 'Lead', status: 'idle', startedAt: 0, updatedAt: 0, log: [] },
  };
  const order = ['lead'];
  props.team.slice(0, 10).forEach((m, i) => {
    const id = `t-${m.name}`;
    agents[id] = { id, kind: 'subagent', type: m.name, label: m.name, status: MOODS[i % MOODS.length], startedAt: 0, updatedAt: 0, log: [] };
    order.push(id);
  });
  return { sessionId: 'lobby', agents, order, ended: false };
}

function mount() {
  if (!use3d.value || !canvas.value || engine) return;
  try {
    engine = new OfficeEngine(canvas.value, { reduceMotion: office.settings?.reduceMotion, npcs: office.settings?.npcs !== false });
  } catch {
    failed.value = true;
    return;
  }
  engine.setAutoRotate(true);
  engine.setMaxFps(20); // decoration only: keep it light, the glass on top re-blurs every frame
  engine.sync(lobbyState());
  const r = host.value!.getBoundingClientRect();
  engine.resize(r.width, r.height);
  ro = new ResizeObserver(([e]) => engine?.resize(e.contentRect.width, e.contentRect.height));
  ro.observe(host.value!);
  engine.start();
}

function unmount() {
  ro?.disconnect();
  ro = undefined;
  engine?.dispose();
  engine = null;
}

onMounted(mount);
onBeforeUnmount(unmount);
watch(() => props.team.map((t) => t.name).join(','), () => engine?.sync(lobbyState()));
watch(() => office.settings?.reduceMotion, (on) => engine?.setReducedMotion(!!on));
watch(() => office.settings?.npcs, (on) => engine?.setNpcs(on !== false));
watch(use3d, (on) => { if (on) requestAnimationFrame(mount); else unmount(); });
</script>

<template>
  <div ref="host" class="backdrop" aria-hidden="true">
    <canvas v-if="use3d" ref="canvas" />
    <div class="blobs" :class="{ solo: !use3d }" />
    <div class="veil" />
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 0; pointer-events: none; background: #E7E1D8; overflow: hidden; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
/* Colour pools that the glass picks up; full strength when there is no 3D scene behind. */
.blobs {
  position: absolute; inset: -10%;
  background:
    radial-gradient(40% 45% at 15% 20%, rgba(255, 196, 120, 0.55), transparent 70%),
    radial-gradient(35% 40% at 85% 25%, rgba(140, 170, 255, 0.45), transparent 70%),
    radial-gradient(40% 40% at 70% 90%, rgba(130, 215, 180, 0.45), transparent 70%),
    radial-gradient(30% 35% at 30% 85%, rgba(255, 140, 190, 0.35), transparent 70%);
  opacity: 0.55;
}
.blobs.solo { opacity: 1; background-color: #EFE7DA; }
/* Soft veil so the scene stays a backdrop and glass text keeps its contrast. */
.veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(243, 241, 236, 0.15), rgba(243, 241, 236, 0.35)); }
</style>
