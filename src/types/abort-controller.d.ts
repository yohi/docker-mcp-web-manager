declare module 'abort-controller' {
  export interface AbortSignal {
    readonly aborted: boolean;
    addEventListener(type: 'abort', listener: () => void): void;
    removeEventListener(type: 'abort', listener: () => void): void;
    onabort?: () => void;
  }

  export class AbortController {
    readonly signal: AbortSignal;
    abort(): void;
  }

  export default AbortController;
}