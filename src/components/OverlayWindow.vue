<!-- Floating window over the office: minimize, maximize/restore and drag by its header.
     Minimized windows stay mounted (v-show) so their content (e.g. xterm) keeps its state. -->
<script setup lang="ts">
import { computed, ref } from 'vue';

export interface WinState {
  mode: 'normal' | 'min' | 'max';
  pos: { x: number; y: number; w: number; h: number } | null;
  z: number;
}

const props = withDefaults(defineProps<{
  state: WinState;
  label: string;
  /** Inline style used while the window has never been dragged. */
  defaultStyle: Record<string, string>;
  maxInset?: { top: number; right: number; bottom: number; left: number };
  dark?: boolean;
}>(), {
  maxInset: () => ({ top: 16, right: 16, bottom: 16, left: 16 }),
  dark: false,
});

const emit = defineEmits<{ 'update:state': [WinState]; focus: [] }>();

const root = ref<HTMLElement | null>(null);
const dragging = ref(false);
let drag: { offX: number; offY: number; w: number; h: number; pw: number; ph: number; pl: number; pt: number } | null = null;

const style = computed((): Record<string, string | number> => {
  const s = props.state;
  if (s.mode === 'max') {
    const i = props.maxInset;
    return { left: `${i.left}px`, top: `${i.top}px`, right: `${i.right}px`, bottom: `${i.bottom}px`, zIndex: 40 };
  }
  if (s.pos) {
    return { left: `${s.pos.x}px`, top: `${s.pos.y}px`, width: `${s.pos.w}px`, height: `${s.pos.h}px`, zIndex: s.z };
  }
  return { ...props.defaultStyle, zIndex: s.z };
});

const set = (patch: Partial<WinState>) => emit('update:state', { ...props.state, ...patch });
const minimize = () => set({ mode: 'min' });
const toggleMax = () => set({ mode: props.state.mode === 'max' ? 'normal' : 'max' });

function onPointerDown(e: PointerEvent) {
  emit('focus');
  if (e.button !== 0 || props.state.mode === 'max' || !root.value) return;
  if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
  const parent = root.value.offsetParent as HTMLElement | null;
  if (!parent) return;
  const r = root.value.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  drag = { offX: e.clientX - r.left, offY: e.clientY - r.top, w: r.width, h: r.height, pw: pr.width, ph: pr.height, pl: pr.left, pt: pr.top };
  dragging.value = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  // Keep at least 120px of the window (and its whole header) reachable.
  const x = Math.min(Math.max(e.clientX - drag.pl - drag.offX, 120 - drag.w), drag.pw - 120);
  const y = Math.min(Math.max(e.clientY - drag.pt - drag.offY, 0), drag.ph - 48);
  set({ pos: { x: Math.round(x), y: Math.round(y), w: Math.round(drag.w), h: Math.round(drag.h) } });
}

function onPointerUp(e: PointerEvent) {
  if (!drag) return;
  drag = null;
  dragging.value = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
}
</script>

<template>
  <section
    v-show="state.mode !== 'min'"
    ref="root"
    class="win"
    :class="{ dark, max: state.mode === 'max' }"
    :style="style"
    :aria-label="label"
    @pointerdown.capture="emit('focus')"
  >
    <div
      class="win-header"
      :class="{ grabbing: dragging, fixed: state.mode === 'max' }"
      title="Seret untuk memindahkan"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="toggleMax"
    >
      <svg class="grip" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>
      <div class="win-title"><slot name="header" /></div>
      <div class="win-actions">
        <button type="button" class="icon" :aria-label="`Minimize ${label}`" @click="minimize">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" class="icon" :aria-label="state.mode === 'max' ? `Kembalikan ukuran ${label}` : `Maximize ${label}`" @click="toggleMax">
          <svg v-if="state.mode === 'max'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="12" height="12" rx="1" /><path d="M8 8V4h12v12h-4" /></svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1" /></svg>
        </button>
      </div>
    </div>
    <div class="win-body"><slot /></div>
  </section>
</template>

<style scoped>
.win {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--ink);
  box-shadow: 0 18px 48px rgba(20, 18, 30, 0.35);
  animation: pop 0.18s ease-out;
}
.win.dark { background: rgba(22, 21, 27, 0.97); color: var(--term-fg); }
.win-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 6px 0 10px;
  border-bottom: 1px solid var(--line);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.dark .win-header { border-bottom-color: var(--term-line); }
.win-header.grabbing { cursor: grabbing; }
.win-header.fixed { cursor: default; }
.grip { flex: none; fill: #8d8999; }
.dark .grip { fill: #6f6b7a; }
.win-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.win-actions { display: flex; gap: 2px; }
.icon {
  width: 36px; height: 36px; display: grid; place-items: center;
  border: 0; border-radius: 8px; background: transparent; cursor: pointer; color: var(--ink-2);
}
.dark .icon { color: #c9c6d3; }
.icon:hover { background: rgba(0, 0, 0, 0.06); }
.dark .icon:hover { background: rgba(255, 255, 255, 0.08); }
.win-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
</style>
