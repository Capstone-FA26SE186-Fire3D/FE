// Short-lived visual bridge only. Never persisted in the demo session or sent to an API.
export type SceneHandoff = { image: string; width: number; height: number };
let handoff: SceneHandoff | null = null;
export function setSceneHandoff(value: SceneHandoff) { handoff = value; }
export function takeSceneHandoff() { const value = handoff; handoff = null; return value; }
