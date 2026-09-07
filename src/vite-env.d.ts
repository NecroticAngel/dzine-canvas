/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    API_ENDPOINT?: string;
    FONT_API_KEY?: string;
    NODE_ENV?: string;
  }
}
