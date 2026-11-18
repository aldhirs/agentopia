<!-- A character: blob body + eyes + role badge, with a status indicator above its head.
     Motion per status matches the canvas design (breathe / bob / type / hop / shake). -->
<script setup lang="ts">
import { computed } from 'vue';
import type { AgentStatus } from '../../../shared/types';

const props = withDefaults(defineProps<{ color: string; status: AgentStatus; tag: string; size?: number }>(), { size: 56 });

const motion = computed(() => ({
  idle: 'm-idle', done: 'm-done', thinking: 'm-think', waiting_subagents: 'm-wait-sub',
  tool_use: 'm-tool', waiting: 'm-hop', waiting_user: 'm-hop', error: 'm-shake',
}[props.status]));

const indicator = computed(() => {
  switch (props.status) {
    case 'thinking': case 'waiting_subagents': return 'dots';
    case 'waiting': case 'waiting_user': return 'bang';
    case 'done': return 'check';
    case 'error': return 'cross';
    default: return null;
  }
});
const scale = computed(() => props.size / 56);
</script>

<template>
  <div class="char-wrap" :style="{ width: `${size}px`, height: `${size * 1.5}px` }">
    <div class="indicator" :style="{ transform: `translateX(-50%) scale(${scale})` }">
      <div v-if="indicator === 'dots'" class="dots" :class="{ slow: status === 'waiting_subagents' }">
        <span /><span /><span />
      </div>
      <div v-else-if="indicator === 'bang'" class="badge bang">!</div>
      <div v-else-if="indicator === 'check'" class="badge check">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      </div>
      <div v-else-if="indicator === 'cross'" class="badge cross">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </div>
    </div>
    <div class="body" :class="motion" :style="{ width: `${size}px`, height: `${size * 0.96}px`, background: color }">
      <div class="eyes" :style="{ top: `${size * 0.3}px`, gap: `${size * 0.21}px` }">
        <span class="eye" :style="{ width: `${size * 0.125}px`, height: `${size * 0.18}px` }" />
        <span class="eye" :style="{ width: `${size * 0.125}px`, height: `${size * 0.18}px` }" />
      </div>
      <span class="tag" :style="{ fontSize: `${Math.max(9, size * 0.18)}px` }">{{ tag }}</span>
    </div>
  </div>
</template>

<style scoped>
.char-wrap { position: relative; }
.indicator { position: absolute; left: 50%; top: 0; height: 24px; display: flex; align-items: center; transform-origin: 50% 100%; }
.body { position: absolute; left: 0; bottom: 0; border-radius: 46% 46% 40% 40%; transform-origin: 50% 100%; }
.eyes { position: absolute; left: 0; right: 0; display: flex; justify-content: center; }
.eye { display: block; border-radius: 4px; background: #1c1b22; animation: blink 4.5s infinite; }
.tag {
  position: absolute; left: 50%; bottom: -2px; transform: translateX(-50%);
  padding: 0 5px; border-radius: 4px; background: #1c1b22; color: #fff;
  font-weight: 700; letter-spacing: 0.04em; line-height: 1.4; white-space: nowrap;
}
.dots { display: flex; gap: 3px; padding: 4px 6px; background: #dbe6ff; border-radius: 10px; }
.dots span { width: 5px; height: 5px; border-radius: 50%; background: #1e40af; animation: dot 1.2s infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
.dots.slow span { animation-duration: 2.4s; }
.badge { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; }
.bang { background: #c2410c; animation: pulse 1s ease-in-out infinite; }
.check { background: #15803d; }
.cross { background: #b42318; }

.m-idle { animation: breathe 3.2s ease-in-out infinite; }
.m-done { animation: breathe 5s ease-in-out infinite; }
.m-think { animation: bob 1.8s ease-in-out infinite; }
.m-wait-sub { animation: bob 3.2s ease-in-out infinite; }
.m-tool { animation: typing 0.32s ease-in-out infinite alternate; }
.m-hop { animation: hop 1.1s ease-in-out infinite; }
.m-shake { animation: shake 2.4s ease-in-out infinite; }

@keyframes breathe { 0%, 100% { transform: translateY(0) scale(1, 1); } 50% { transform: translateY(-2px) scale(1.02, 0.98); } }
@keyframes bob { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-4px) rotate(3deg); } }
@keyframes typing { from { transform: translateY(0); } to { transform: translateY(-3px); } }
@keyframes hop { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-12px); } }
@keyframes shake { 0%, 30%, 100% { transform: translateX(0); } 5%, 15%, 25% { transform: translateX(-3px); } 10%, 20% { transform: translateX(3px); } }
@keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
@keyframes dot { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
</style>
