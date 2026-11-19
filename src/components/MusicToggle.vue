<!-- Quick on/off for the background music; volume lives in Pengaturan. -->
<script setup lang="ts">
import { computed } from 'vue';
import { office, updateSettings } from '../stores/office';

const on = computed(() => !!office.settings?.music);
</script>

<template>
  <button
    type="button" class="music" :aria-pressed="on" :aria-label="on ? 'Matikan musik' : 'Nyalakan musik'"
    :title="on ? 'Matikan musik' : 'Nyalakan musik'" @click="updateSettings({ music: !on })"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <template v-if="on"><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></template>
      <template v-else><path d="m22 9-6 6" /><path d="m16 9 6 6" /></template>
    </svg>
  </button>
</template>

<style scoped>
.music { width: 40px; min-height: 38px; padding: 0; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line-2, var(--line)); background: #fff; color: inherit; cursor: pointer; }
.music[aria-pressed='false'] { color: var(--muted); }
</style>
