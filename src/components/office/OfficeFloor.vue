<!-- The office floor for one session: lead room, hot desks for subagents, pantry,
     task board and animated task/report wires. Scales to cover the stage. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AgentState, OfficeState } from '../../../shared/types';
import DeskUnit from './DeskUnit.vue';
import { nextSeats, seatPosition, worldHeight, type Seat } from '../../lib/seats';
import { onEffects } from '../../stores/office';

const props = defineProps<{ state: OfficeState; selectedId: string | null }>();
const emit = defineEmits<{
  select: [id: string];
  anchor: [rect: { x: number; y: number; w: number; h: number } | null];
}>();

const WORLD_W = 1440;
const LEAD = { x: 565, y: 150 };
const LEAD_POINT = { x: 565, y: 190 };

const root = ref<HTMLElement | null>(null);
const size = ref({ w: 1440, h: 900 });
let ro: ResizeObserver | undefined;

const subagents = computed<AgentState[]>(() =>
  props.state.order.filter((id) => id !== 'lead').map((id) => props.state.agents[id]));

const seats = ref<Record<string, Seat>>({});
watch(subagents, (list) => {
  seats.value = nextSeats(seats.value, list.map((a) => ({ id: a.id, done: a.status === 'done' })));
}, { immediate: true });

const worldH = computed(() => worldHeight(seats.value));
// Cover the stage at the default height; once the office grows, fit it instead so nobody is cut off.
const scale = computed(() => {
  const { w, h } = size.value;
  return worldH.value > 900 ? Math.min(w / WORLD_W, h / worldH.value) : Math.max(w / WORLD_W, h / 900);
});
const origin = computed(() => ({
  x: (size.value.w - WORLD_W * scale.value) / 2,
  y: (size.value.h - worldH.value * scale.value) / 2,
}));

const placed = computed(() => subagents.value.map((a) => {
  const seat = seats.value[a.id] ?? { area: 'desk', index: 0 };
  return { agent: a, seat, pos: seatPosition(seat) };
}));

const taskBoard = computed(() => subagents.value.filter((a) => a.description).slice(-6)
  .map((a) => ({ id: a.id, text: a.description!, done: a.status === 'done' })));

// --- wires (task dispatch / report back) ---
interface Wire { key: number; to: string; kind: 'dispatch' | 'report' }
const wires = ref<Wire[]>([]);
let wireKey = 0;
const offEffects = onEffects((sessionId, effects) => {
  if (sessionId !== props.state.sessionId) return;
  for (const e of effects) {
    const w: Wire = { key: ++wireKey, to: e.type === 'dispatch' ? e.to : e.from, kind: e.type };
    wires.value = [...wires.value, w];
    setTimeout(() => { wires.value = wires.value.filter((x) => x.key !== w.key); }, 3200);
  }
});
const wireStyles = computed(() => wires.value.flatMap((w) => {
  const p = placed.value.find((x) => x.agent.id === w.to);
  if (!p) return [];
  const tx = p.pos.x, ty = p.pos.y - 40;
  const dx = tx - LEAD_POINT.x, dy = ty - LEAD_POINT.y;
  return [{
    key: w.key, kind: w.kind,
    style: {
      left: `${LEAD_POINT.x}px`, top: `${LEAD_POINT.y}px`,
      width: `${Math.round(Math.hypot(dx, dy))}px`,
      transform: `rotate(${Math.atan2(dy, dx)}rad)`,
    },
  }];
}));

// --- anchor for the detail card (stage coordinates of the selected desk) ---
function rectFor(id: string | null) {
  if (!id) return null;
  const s = scale.value, o = origin.value;
  if (id === 'lead') return { x: o.x + (LEAD.x - 110) * s, y: o.y + (LEAD.y - 95) * s, w: 220 * s, h: 170 * s };
  const p = placed.value.find((x) => x.agent.id === id);
  if (!p) return null;
  const w = (p.seat.area === 'desk' ? 200 : 150) * s;
  return { x: o.x + p.pos.x * s - w / 2, y: o.y + (p.pos.y - 95) * s, w, h: 170 * s };
}
watch([() => props.selectedId, scale, origin, placed], () => emit('anchor', rectFor(props.selectedId)), { immediate: true });

onMounted(() => {
  ro = new ResizeObserver(([entry]) => {
    size.value = { w: entry.contentRect.width, h: entry.contentRect.height };
  });
  ro.observe(root.value!);
});
onBeforeUnmount(() => { ro?.disconnect(); offEffects(); });
</script>

<template>
  <div ref="root" class="floor-stage" role="region" aria-label="Kantor">
    <div
      class="world"
      :style="{ height: `${worldH}px`, transform: `translate(${origin.x}px, ${origin.y}px) scale(${scale})` }"
    >
      <div class="ground" />
      <div class="pantry-ground" />
      <div class="wall" style="left: 1032px; top: 0; width: 10px; height: 330px" />
      <div class="wall" style="left: 1032px; top: 470px; width: 10px; bottom: 0" />
      <div class="wall" style="left: 0; top: 235px; width: 470px; height: 10px" />
      <div class="wall" style="left: 660px; top: 235px; width: 380px; height: 10px" />
      <div class="rug" :style="{ height: `${worldH - 330}px` }" />

      <span class="room-label" style="left: 36px; top: 200px">Ruang lead</span>
      <span class="room-label" style="left: 36px; top: 262px">Area kerja subagent</span>
      <span class="room-label pantry-label" style="left: 1068px; top: 200px">Pantry</span>

      <div class="board" aria-label="Papan tugas">
        <p>Papan tugas</p>
        <ol v-if="taskBoard.length">
          <li v-for="t in taskBoard" :key="t.id" :class="{ done: t.done }">{{ t.text }}</li>
        </ol>
        <p v-else class="empty">Belum ada tugas untuk subagent.</p>
      </div>

      <div class="decor sofa" aria-hidden="true" />
      <div class="decor table" aria-hidden="true" />
      <div class="decor coffee" aria-hidden="true"><span /></div>
      <div class="decor plant" style="left: 1380px; top: 40px" aria-hidden="true" />
      <div class="decor plant" style="left: 24px; top: 40px" aria-hidden="true" />
      <div class="decor plant" :style="{ left: '1370px', top: `${worldH - 80}px` }" aria-hidden="true" />

      <div v-for="w in wireStyles" :key="w.key" class="wire" :class="w.kind" :style="w.style" aria-hidden="true">
        <span class="dash" /><span class="paper" />
      </div>

      <div class="slot" :style="{ left: `${LEAD.x - 110}px`, top: `${LEAD.y - 95}px` }">
        <DeskUnit :agent="state.agents.lead" big :selected="selectedId === 'lead'" @select="emit('select', $event)" />
      </div>

      <div
        v-for="p in placed" :key="p.agent.id" class="slot"
        :style="{ left: `${p.pos.x - (p.seat.area === 'desk' ? 100 : 75)}px`, top: `${p.pos.y - 95}px` }"
      >
        <DeskUnit :agent="p.agent" :bare="p.seat.area === 'pantry'" :selected="selectedId === p.agent.id" @select="emit('select', $event)" />
      </div>

      <p v-if="!subagents.length" class="hint">
        Subagent akan muncul di sini saat Lead mendelegasikan tugas.
      </p>
    </div>
  </div>
</template>

<style scoped>
.floor-stage { position: absolute; inset: 0; overflow: hidden; background: var(--night); }
.world { position: absolute; left: 0; top: 0; width: 1440px; transform-origin: 0 0; }
.ground { position: absolute; inset: 0; background-color: var(--floor); background-image: repeating-linear-gradient(90deg, rgba(120, 90, 50, 0.07) 0 2px, transparent 2px 72px); }
.pantry-ground { position: absolute; left: 1040px; top: 0; width: 400px; bottom: 0; background-color: #dce3da; background-image: repeating-linear-gradient(45deg, rgba(60, 90, 60, 0.06) 0 2px, transparent 2px 22px); }
.wall { position: absolute; background: var(--wall); }
.rug { position: absolute; left: 100px; top: 262px; width: 920px; border-radius: 22px; background: #d8c7a6; opacity: 0.45; }
.room-label { position: absolute; font-family: var(--font-display); font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #6b5d45; }
.pantry-label { color: #4f6a4c; }
.board { position: absolute; left: 740px; top: 30px; width: 270px; height: 180px; border-radius: 8px; background: #fff; border: 5px solid #9c93a8; padding: 10px 14px; overflow: hidden; }
.board p { margin: 0 0 6px; font-family: var(--font-display); font-size: 15px; font-weight: 600; }
.board .empty { font-family: var(--font-sans); font-size: 12px; font-weight: 400; color: var(--muted); }
.board ol { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.5; color: var(--ink-2); }
.board li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.board li.done { text-decoration: line-through; color: var(--muted); }
.decor { position: absolute; }
.sofa { left: 1100px; top: 250px; width: 260px; height: 70px; border-radius: 16px; background: #8e9aaf; box-shadow: inset 0 -12px 0 #7a869b; }
.table { left: 1170px; top: 640px; width: 120px; height: 120px; border-radius: 50%; background: #c9a877; box-shadow: inset 0 -8px 0 #b08f5f; }
.coffee { left: 1070px; top: 20px; width: 90px; height: 60px; border-radius: 8px; background: var(--wall); }
.coffee span { position: absolute; left: 14px; top: 12px; width: 26px; height: 34px; border-radius: 4px; background: #2a2833; }
.plant { width: 46px; height: 46px; border-radius: 50%; background: #6fa86b; box-shadow: inset -6px -6px 0 #5a8f57; }
.slot { position: absolute; z-index: 2; }
.hint { position: absolute; left: 160px; top: 420px; width: 800px; margin: 0; text-align: center; font-size: 16px; color: #6b5d45; }

.wire { position: absolute; height: 3px; transform-origin: 0 50%; z-index: 1; pointer-events: none; animation: wire-life 3.2s ease forwards; }
.wire .dash { position: absolute; inset: 0; background-image: repeating-linear-gradient(90deg, var(--c) 0 8px, transparent 8px 16px); background-size: 16px 3px; animation: dash 0.8s linear infinite; }
.wire .paper { position: absolute; top: -8px; margin-left: -10px; width: 20px; height: 16px; border-radius: 3px; background: #fff; border: 2px solid var(--c); animation: travel 1.5s ease-in-out infinite; }
.wire.dispatch { --c: #3b4bd8; }
.wire.report { --c: #15803d; }
.wire.report .paper { animation-direction: reverse; }
@keyframes travel { from { left: 0%; } to { left: 100%; } }
@keyframes dash { to { background-position: 16px 0; } }
@keyframes wire-life { 0% { opacity: 0; } 8% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
</style>
