/// <reference types="office-js" />

export {}

declare global {
  interface Window {
    Office?: typeof Office
  }
}
