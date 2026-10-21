import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODEL_HEIGHT, MODEL_IDS, OCCUPANTS, occupantPose, type ClipId, type ModelId, type Occupant } from "./layout";
import { animationInterval, type Tier } from "./budget";

const HEIGHT = MODEL_HEIGHT;
const MODEL_URL = (id: ModelId) => `/models/landing/${id}.glb`;
const ANIMATIONS_URL = "/models/landing/animations.glb";

type Rest = Map<string, THREE.Quaternion>;

export type CharacterAssets = {
  models: Record<ModelId, THREE.Object3D>;
  /** Bind-pose local rotation of every bone: the clip skeleton ("src") and each character. */
  rest: Record<ModelId | "src", Rest>;
  retargeted: Map<string, THREE.AnimationClip>;
  clips: Record<ClipId, THREE.AnimationClip>;
  /** Ground speed (m/s) a clip covers per cycle when played at timeScale 1, measured before it was made in-place. */
  clipSpeed: Record<ClipId, number>;
};

let cached: Promise<CharacterAssets> | null = null;

/** Mixamo clips carry root travel. Remove it from the hips track so the app drives the position; keep the vertical bob. */
function makeInPlace(clip: THREE.AnimationClip): number {
  let travel = 0;
  for (const track of clip.tracks) {
    if (!track.name.endsWith(".position") || !/Hips/.test(track.name)) continue;
    const v = track.values, n = track.times.length;
    for (let axis = 0; axis < 3; axis++) {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < n; i++) { const x = v[i * 3 + axis]; min = Math.min(min, x); max = Math.max(max, x); }
      const net = v[(n - 1) * 3 + axis] - v[axis], range = max - min;
      if (range > 0.05 && Math.abs(net) > range * 0.5) {
        travel = Math.max(travel, Math.abs(net));
        for (let i = 0; i < n; i++) v[i * 3 + axis] = v[axis];
      }
    }
  }
  return travel / Math.max(1e-3, clip.duration);
}

function restOf(root: THREE.Object3D): Rest {
  const rest: Rest = new Map();
  root.traverse(o => { if ((o as THREE.Bone).isBone) rest.set(o.name, o.quaternion.clone()); });
  return rest;
}

/**
 * The clips were baked onto the PlayerMale skeleton, so each rotation is `restPlayerMale * delta`. The other characters
 * share the bone names but not the bind pose (the hands differ by ~40 degrees), which curled hands and crossed arms.
 * Re-express every rotation on the target's own bind pose: `restTarget * restSource^-1 * q`.
 */
function retarget(assets: CharacterAssets, model: ModelId, clipName: ClipId): THREE.AnimationClip {
  const key = `${model}:${clipName}`, found = assets.retargeted.get(key);
  if (found) return found;
  const source = assets.clips[clipName], src = assets.rest.src, dst = assets.rest[model];
  const fix = new THREE.Quaternion(), q = new THREE.Quaternion(), tracks = source.tracks.map(track => {
    const copy = track.clone();
    if (!track.name.endsWith(".quaternion")) return copy;
    const node = track.name.slice(0, track.name.lastIndexOf("."));
    const restSrc = src.get(node), restDst = dst.get(node);
    if (!restSrc || !restDst) return copy;
    fix.copy(restDst).multiply(restSrc.clone().invert());
    for (let i = 0; i < copy.values.length; i += 4) {
      q.fromArray(copy.values, i); q.premultiply(fix).normalize(); q.toArray(copy.values, i);
    }
    return copy;
  });
  const clip = new THREE.AnimationClip(source.name, source.duration, tracks);
  assets.retargeted.set(key, clip);
  return clip;
}

/**
 * "Start Walking" accelerates, then settles into a steady gait. Find the loop point (start frame + length) where the
 * pose repeats best, and cut that stretch out as the walk cycle.
 */
function loopWalk(source: THREE.AnimationClip, name: string): THREE.AnimationClip {
  const fps = 30, frames = Math.round(source.duration * fps);
  const quats = source.tracks.filter(t => t.name.endsWith(".quaternion"));
  const at = (track: THREE.KeyframeTrack, frame: number) => { const i = Math.min(track.times.length - 1, frame) * 4; return track.values.subarray(i, i + 4); };
  let best = { start: Math.floor(frames * 0.4), length: 30, error: Infinity };
  for (let length = 26; length <= 36; length++) for (let start = Math.floor(frames * 0.35); start + length < frames; start++) {
    let error = 0;
    for (const track of quats) { const a = at(track, start), b = at(track, start + length); error += 1 - Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); }
    if (error < best.error) best = { start, length, error };
  }
  return THREE.AnimationUtils.subclip(source, name, best.start, best.start + best.length, fps);
}

/** Loaded once per page session and reused by every scene mount (branch switches never refetch). */
export function loadCharacterAssets(): Promise<CharacterAssets> {
  cached ??= (async () => {
    const loader = new GLTFLoader();
    const ids = MODEL_IDS;
    const [animations, ...models] = await Promise.all([loader.loadAsync(ANIMATIONS_URL), ...ids.map(id => loader.loadAsync(MODEL_URL(id)))]);
    const clips = {} as Record<ClipId, THREE.AnimationClip>, clipSpeed = {} as Record<ClipId, number>;
    for (const source of animations.animations) {
      const clip = source.name === "WalkSource" ? loopWalk(source, "Walk") : source;
      clipSpeed[clip.name as ClipId] = makeInPlace(clip); clips[clip.name as ClipId] = clip;
    }
    const out = {} as Record<ModelId, THREE.Object3D>;
    ids.forEach((id, i) => { out[id] = models[i].scene; });
    const rest = { src: restOf(animations.scene) } as Record<ModelId | "src", Rest>;
    ids.forEach(id => { rest[id] = restOf(out[id]); });
    return { models: out, rest, retargeted: new Map(), clips, clipSpeed };
  })().catch(error => { cached = null; throw error; });
  return cached;
}

/** For tests: forget the cache so the next load refetches. */
export function resetCharacterAssets() { cached = null; }

type Actor = {
  occupant: Occupant; holder: THREE.Group; mixer: THREE.AnimationMixer; action: THREE.AnimationAction;
  height: number; accumulated: number; frame: number;
};

export function createCharacters(assets: CharacterAssets, parent: THREE.Object3D, initialTier: Tier) {
  const group = new THREE.Group(); group.name = "occupants"; parent.add(group);
  const actors: Actor[] = OCCUPANTS.map(occupant => {
    const root = SkeletonUtils.clone(assets.models[occupant.model]);
    root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; });
    // Normalise to the real character height measured from the bind pose.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    const scale = HEIGHT[occupant.model] / Math.max(0.01, box.max.y - box.min.y);
    root.scale.multiplyScalar(scale); root.updateMatrixWorld(true);
    const feet = new THREE.Box3().setFromObject(root, true).min.y;
    root.position.y -= feet;
    const holder = new THREE.Group(); holder.name = occupant.id; holder.add(root); group.add(holder);
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(retarget(assets, occupant.model, occupant.clip)); action.play();
    action.time = (occupant.id.length * 0.37) % action.getClip().duration;
    // Foot sync: playback speed follows the ground speed, so feet do not slide.
    const clipSpeed = assets.clipSpeed[occupant.clip];
    action.timeScale = occupant.dir !== 0 && clipSpeed > 0.2 ? occupant.speed / (clipSpeed * scale) : 1;
    return { occupant, holder, mixer, action, height: HEIGHT[occupant.model], accumulated: 0, frame: 0 };
  });
  let tier = initialTier, active = actors.length, lineup = false;
  const world = new THREE.Vector3();
  return {
    group, actors,
    /** Diagnostic: stand everyone in a row facing +Z at z = 40 to inspect rigs and skinning. */
    setLineup(on: boolean) { lineup = on; },
    /** Diagnostic: play one named clip on every actor (clip names come from animations.glb). */
    debugPlay(clipName: string) { for (const a of actors) { if (!(clipName in assets.clips)) continue; a.mixer.stopAllAction(); a.action = a.mixer.clipAction(retarget(assets, a.occupant.model, clipName as ClipId)); a.action.timeScale = 1; a.action.play(); } },
    setBudget(count: number, nextTier: Tier) { active = Math.min(actors.length, count); tier = nextTier; actors.forEach((a, i) => { a.holder.visible = i < active; }); },
    /** `camera` decides animation LOD; `time` is the shared scene clock. */
    update(delta: number, time: number, camera: THREE.Camera) {
      let animated = 0;
      for (let i = 0; i < active; i++) {
        const a = actors[i], pose = occupantPose(a.occupant, time);
        if (lineup) { a.holder.position.set((i - (active - 1) / 2) * 1.0, 0, 40); a.holder.rotation.y = 0; a.holder.scale.setScalar(1); }
        else { a.holder.position.set(pose.position[0], pose.position[1], pose.position[2]); a.holder.rotation.y = pose.yaw; a.holder.scale.setScalar(Math.max(0.001, pose.visibility)); }
        a.holder.getWorldPosition(world);
        const interval = animationInterval(world.distanceTo(camera.position), tier);
        a.accumulated += delta;
        if (++a.frame % interval === 0) { a.mixer.update(a.accumulated); a.accumulated = 0; animated++; }
      }
      return animated;
    },
    dispose() { for (const a of actors) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.mixer.getRoot()); } parent.remove(group); },
  };
}
