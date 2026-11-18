<script setup lang="ts">
import { onMounted } from 'vue';
import DevLobby from './pages/DevLobby.vue';
import SessionView from './pages/SessionView.vue';
import { initOffice, office } from './stores/office';

onMounted(() => { initOffice(); });
</script>

<template>
  <SessionView v-if="office.currentId" :key="office.currentId" :session-id="office.currentId" />
  <DevLobby v-else />
</template>
