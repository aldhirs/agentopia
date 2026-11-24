<!-- 3D startup office for one session. Drag to rotate, scroll to zoom, double-click to reset,
     click a character to select it. Emits `failed` if WebGL is unavailable (caller falls back to 2D). -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { OfficeState } from '../../../shared/types';
import { OfficeEngine } from '../../office3d/engine';
import { office, onEffects } from '../../stores/office';

const props = defineProps<{ state: OfficeState; selectedId: string | null }>();
const emit = defineEmits<{
  select: [id: string];
  anchor: [rect: { x: number; y: number; w: number; h: number } | null];
  failed: [reason: string];
}>();

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
let engine: OfficeEngine | null = null;
let ro: ResizeObserver | undefined;
let anchorTimer: ReturnType<typeof setInterval> | undefined;
let offEffects: (() => void) | undefined;
let drag: { x: number; moved: number } | null = null;

function emitAnchor() {
  if (!engine || !props.selectedId) { emit('anchor', null); return; }
  emit('anchor', engine.rectOf(props.selectedId));
}

onMounted(() => {
  try {
    engine = new OfficeEngine(canvas.value!, { reduceMotion: office.settings?.reduceMotion, npcs: office.settings?.npcs !== false });
  } catch (e) {
    emit('failed', (e as Error).message);
    return;
  }
  engine.sync(props.state);
  engine.select(props.selectedId);
  ro = new ResizeObserver(([entry]) => {
    engine?.resize(entry.contentRect.width, entry.contentRect.height);
    emitAnchor();
  });
  ro.observe(host.value!);
  offEffects = onEffects((sessionId, effects) => {
    if (sessionId === props.state.sessionId) engine?.effects(effects);
  });
  anchorTimer = setInterval(emitAnchor, 200);
  engine.start();
  // Expose stats for the performance harness and debugging.
  (window as unknown as { __officeStats?: () => unknown }).__officeStats = () => engine?.stats();
});

watch(() => props.state, (s) => engine?.sync(s));
watch(() => props.selectedId, (id) => { engine?.select(id); emitAnchor(); });
watch(() => office.settings?.reduceMotion, (on) => engine?.setReducedMotion(!!on));
watch(() => office.settings?.npcs, (on) => engine?.setNpcs(on !== false));

onBeforeUnmount(() => {
  clearInterval(anchorTimer);
  offEffects?.();
  ro?.disconnect();
  engine?.dispose();
  engine = null;
});

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  drag = { x: e.clientX, moved: 0 };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!drag || !engine) return;
  const dx = e.clientX - drag.x;
  drag.moved += Math.abs(dx);
  drag.x = e.clientX;
  engine.rotate(dx);
}
function onPointerUp(e: PointerEvent) {
  if (!drag) return;
  const wasClick = drag.moved < 5;
  drag = null;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  if (wasClick && engine) {
    const id = engine.pick(e.clientX, e.clientY);
    if (id) emit('select', id);
  }
}
function onWheel(e: WheelEvent) {
  e.preventDefault();
  engine?.zoom(e.deltaY);
}
</script>

<template>
  <div ref="host" class="office3d">
    <canvas
      ref="canvas"
      aria-label="Kantor 3D. Seret untuk memutar, scroll untuk zoom, klik karakter untuk melihat detail."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
      @dblclick="engine?.resetView()"
    />
  </div>
</template>

<style scoped>
.office3d { position: absolute; inset: 0; background: #E7E1D8; }
canvas { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
canvas:active { cursor: grabbing; }
</style>
