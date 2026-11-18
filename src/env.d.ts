/// <reference types="vite/client" />
import type { OfficeApi } from '../shared/types';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare global {
  interface Window {
    office: OfficeApi;
  }
}
