<script setup lang="ts">
function throwInVue() { throw new Error('Nuxt example: failed to save quote'); }
function rejectPromise() { void Promise.reject(new Error('Nuxt example: rejected request')); }
function manualError() { useNuxtApp().$errorReporting?.captureException(new Error('Nuxt example: handled error')); }
</script>
<template>
  <main style="font-family: sans-serif; max-width: 640px; margin: 60px auto; line-height: 1.6">
    <h1>Traceflow error example</h1>
    <p>Trigger an error, then find it in Traceflow under webapp / test, build nuxt-example.</p>
    <button @click="throwInVue">Throw Vue error</button>
    <button @click="rejectPromise">Reject promise</button>
    <button @click="manualError">Capture handled error</button>
  </main>
</template>
