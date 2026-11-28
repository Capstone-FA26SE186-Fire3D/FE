// The idempotency module imports hooks, but command-key adapter tests never render React.
export const useCallback = () => { throw new Error('React hook used outside component test'); };
export const useRef = () => { throw new Error('React hook used outside component test'); };
