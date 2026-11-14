import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { CLIP_SPEED, MODEL_HEIGHT, MODEL_IDS, OCCUPANTS, occupantPose, type ClipId, type ModelId, type Occupant } from "./layout";
import { animationInterval, type Tier } from "./budget";

const HEIGHT = MODEL_HEIGHT;
/**
 * /models is cached for a day (next.config.ts) and these files keep their names when they are rebuilt: bump this
 * whenever a body, the clips or the carry pose changes, or browsers pair the new code with the old files.
 */
const ASSET_VERSION = "2026-11-14.5";
const MODEL_URL = (id: ModelId) => `/models/landing/${id}.glb?v=${ASSET_VERSION}`;
const ANIMATIONS_URL = `/models/landing/animations.glb?v=${ASSET_VERSION}`;
const CARRY_URL = `/models/landing/carry-pose.json?v=${ASSET_VERSION}`;

/** A pose authored in Blender on two real bodies (scripts/build_landing_carry.py): per bone, the rotation away from the rest pose in model space. */
export type CarryPose = {
  carrier: ModelId; child: ModelId; childScale: number;
  carrierBones: Record<string, number[]>; childBones: Record<string, number[]>;
  childPosition: [number, number, number]; childRotation: [number, number, number, number];
};

/** Bind pose of every bone in model space: its own rotation and its parent's. */
type Rest = Map<string, { world: THREE.Quaternion; parent: THREE.Quaternion }>;

export type CharacterAssets = {
  models: Record<ModelId, THREE.Object3D>;
  /** Bind-pose local rotation of every bone: the clip skeleton ("src") and each character. */
  rest: Record<ModelId | "src", Rest>;
  restPosition: Record<ModelId | "src", ReturnType<typeof restPositionOf>>;
  retargeted: Map<string, THREE.AnimationClip>;
  clips: Record<ClipId, THREE.AnimationClip>;
  /** Missing when the file could not be loaded: the carrier then simply walks. */
  carry: CarryPose | null;
};

let cached: Promise<CharacterAssets> | null = null;

function restOf(root: THREE.Object3D): Rest {
  const rest: Rest = new Map();
  root.updateMatrixWorld(true);
  root.traverse(o => { if ((o as THREE.Bone).isBone) rest.set(o.name, { world: o.getWorldQuaternion(new THREE.Quaternion()), parent: o.parent ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion() }); });
  return rest;
}

function restPositionOf(root: THREE.Object3D) {
  // `unit` is how long one unit of the bone position is in metres (bodies keep their bones at different scales).
  const rest = new Map<string, { position: THREE.Vector3; unit: number }>();
  root.updateMatrixWorld(true);
  root.traverse(o => { if ((o as THREE.Bone).isBone) rest.set(o.name, { position: o.position.clone(), unit: o.parent ? o.parent.getWorldScale(new THREE.Vector3()).y : 1 }); });
  return rest;
}

/**
 * The clips were recorded on the PlayerMale skeleton. Every body shares the bone names, but each has its own bone axes
 * (the forearm and hand rolls differ by up to 100 degrees after the palm repair, children have other leg axes), so a
 * joint rotation cannot be copied bone to bone: that twisted forearms thin and splayed the children's legs. Instead
 * every bone turns by the same amount in model space as on the source: with bind rotations W (bone) and P (parent),
 * `q_target = P_target^-1 * P_source * q_source * W_source^-1 * W_target`. Hip travel is scaled to the body's size.
 */
const SPINE = /CC_Base_(Waist|Spine01|Spine02)$/;
/**
 * On a slim body the straight trunk of the run still reads as a hollow back with the chest pushed out (the body itself
 * stands straight: checked in Blender). In the run only, each spine bone of these bodies bends forward by this much
 * (radians), which rounds the back into the run.
 */
const RUN_BEND: Partial<Record<ModelId, number>> = { CasualBlackShirt: 0.13 };
const FORWARD = new THREE.Vector3(1, 0, 0);

function retarget(assets: CharacterAssets, model: ModelId, clipName: ClipId): THREE.AnimationClip {
  const key = `${model}:${clipName}`, found = assets.retargeted.get(key);
  if (found) return found;
  const source = assets.clips[clipName], src = assets.rest.src, dst = assets.rest[model];
  const pre = new THREE.Quaternion(), post = new THREE.Quaternion(), q = new THREE.Quaternion(), v = new THREE.Vector3(), home = new THREE.Quaternion(), spine = new THREE.Quaternion(), posture = new THREE.Quaternion();
  // Only rotations, and the travel of the hips: bone lengths and bone scales stay the body's own (the clip file
  // also carries the source body's, which stretched the children to adult size).
  const hips = /Hip$/;
  const kept = source.tracks.filter(track => track.name.endsWith(".quaternion") || (track.name.endsWith(".position") && hips.test(track.name.slice(0, track.name.lastIndexOf(".")))));
  const tracks = kept.map(track => {
    const copy = track.clone();
    const node = track.name.slice(0, track.name.lastIndexOf("."));
    const a = src.get(node), b = dst.get(node);
    if (!a || !b) return copy;
    pre.copy(b.parent).invert().multiply(a.parent);
    if (track.name.endsWith(".position")) {
      // The only moving position is the hips: its travel, turned into this body's parent axes and scaled to its size.
      const home = assets.restPosition[model].get(node), from = assets.restPosition.src.get(node);
      if (home && from) {
        const k = (HEIGHT[model] / HEIGHT.PlayerMale) * (from.unit / home.unit);
        for (let i = 0; i < copy.values.length; i += 3) { v.fromArray(copy.values, i).sub(from.position).applyQuaternion(pre).multiplyScalar(k).add(home.position); v.toArray(copy.values, i); }
      }
      return copy;
    }
    if (!track.name.endsWith(".quaternion")) return copy;
    post.copy(a.world).invert().multiply(b.world);
    // The game's run tips the hips forward and bends the lower back the other way to keep the chest up, which reads
    // as a hollow back. Keep the spine straight so the trunk follows the hips into the run.
    const straighten = clipName === "Run" && SPINE.test(node) ? 0 : 1;
    home.copy(b.parent).invert().multiply(b.world);
    // A bend about the model's side axis, expressed in the parent's axes: `parent^-1 * bend * parent`.
    const bend = clipName === "Run" && SPINE.test(node) ? RUN_BEND[model] ?? 0 : 0;
    if (bend) posture.copy(b.parent).invert().multiply(spine.setFromAxisAngle(FORWARD, bend)).multiply(b.parent);
    for (let i = 0; i < copy.values.length; i += 4) {
      q.fromArray(copy.values, i); q.premultiply(pre).multiply(post).normalize();
      if (straighten < 1) q.copy(spine.copy(home).slerp(q, straighten));
      if (bend) q.premultiply(posture);
      q.toArray(copy.values, i);
    }
    return copy;
  });
  const clip = new THREE.AnimationClip(source.name, source.duration, tracks);
  assets.retargeted.set(key, clip);
  return clip;
}

/**
 * A held pose as a clip for `model`: every bone named in `bones` keeps the rotation the pose gives it (rotation away
 * from the rest pose in model space; a bone's local rotation is `P^-1 * Dp^-1 * D * W` with its parent's delta Dp).
 * With `base`, the other bones keep playing that clip, so a body can walk on its legs while its arms hold the pose.
 */
export function heldPose(assets: CharacterAssets, model: ModelId, name: string, bones: Record<string, number[]>, base?: ClipId): THREE.AnimationClip {
  const key = `${model}:${name}`, found = assets.retargeted.get(key);
  if (found) return found;
  const rest = assets.rest[model], walk = base ? retarget(assets, model, base) : null, duration = walk ? walk.duration : 1;
  const delta = new THREE.Quaternion(), parentDelta = new THREE.Quaternion(), q = new THREE.Quaternion();
  const parentOf = new Map<string, string>();
  assets.models[model].traverse(o => { if ((o as THREE.Bone).isBone && o.parent && (o.parent as THREE.Bone).isBone) parentOf.set(o.name, o.parent.name); });
  const tracks: THREE.KeyframeTrack[] = walk ? walk.tracks.filter(t => !(t.name.slice(0, t.name.lastIndexOf(".")) in bones)) : [];
  for (const [bone, value] of Object.entries(bones)) {
    const r = rest.get(bone);
    if (!r) continue;
    delta.fromArray(value);
    const up = parentOf.get(bone), upValue = up ? bones[up] : undefined;
    if (upValue) parentDelta.fromArray(upValue).invert(); else parentDelta.identity();
    q.copy(r.parent).invert().multiply(parentDelta).multiply(delta).multiply(r.world).normalize();
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, [0, duration], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]));
  }
  const clip = new THREE.AnimationClip(name, duration, tracks);
  assets.retargeted.set(key, clip);
  return clip;
}

/** Loaded once per page session and reused by every scene mount (branch switches never refetch). */
export function loadCharacterAssets(): Promise<CharacterAssets> {
  cached ??= (async () => {
    const loader = new GLTFLoader();
    const ids = MODEL_IDS;
    const [animations, carry, ...models] = await Promise.all([
      loader.loadAsync(ANIMATIONS_URL),
      fetch(CARRY_URL).then(r => (r.ok ? (r.json() as Promise<CarryPose>) : null)).catch(() => null),
      ...ids.map(id => loader.loadAsync(MODEL_URL(id))),
    ]);
    const clips = {} as Record<ClipId, THREE.AnimationClip>;
    for (const clip of animations.animations) clips[clip.name as ClipId] = clip;
    const out = {} as Record<ModelId, THREE.Object3D>;
    ids.forEach((id, i) => { out[id] = models[i].scene; });
    const rest = { src: restOf(animations.scene) } as Record<ModelId | "src", Rest>;
    const restPosition = { src: restPositionOf(animations.scene) } as Record<ModelId | "src", ReturnType<typeof restPositionOf>>;
    ids.forEach(id => { rest[id] = restOf(out[id]); restPosition[id] = restPositionOf(out[id]); });
    return { models: out, rest, restPosition, retargeted: new Map(), clips, carry };
  })().catch(error => { cached = null; throw error; });
  return cached;
}

/** For tests: forget the cache so the next load refetches. */
export function resetCharacterAssets() { cached = null; }

export type Body = {
  holder: THREE.Group; root: THREE.Object3D; mixer: THREE.AnimationMixer; action: THREE.AnimationAction; height: number;
  /** Fades the body in or out (0..1) without changing its size: a dithered fade, so it stays in the opaque pass. */
  setOpacity(value: number): void; dispose(): void;
  /**
   * Call after the mixer moved the bones: lifts the body by however far its lower ankle is under its standing height.
   * Clips are recorded on one body; on other leg lengths the hips end up a little low and the feet sink into the floor.
   */
  ground(): void;
};

/** One skinned body standing on the ground at its real height, playing `clip`; `speed` (m/s) keeps the feet from sliding. */
export function spawnBody(assets: CharacterAssets, id: string, model: ModelId, clip: ClipId, speed = 0, height = HEIGHT[model], held?: THREE.AnimationClip): Body {
  const root = SkeletonUtils.clone(assets.models[model]);
  // Own materials (the textures stay shared) so each body fades by itself.
  const materials: THREE.Material[] = [];
  const skins: THREE.SkinnedMesh[] = [];
  root.traverse(o => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.frustumCulled = false;
    skins.push(mesh);
    const own = (mesh.material as THREE.Material).clone(); own.alphaHash = true; mesh.material = own; materials.push(own);
  });
  let opacity = 1;
  // Measure the posed skin, not the raw vertices: bodies store their vertices at different scales under the armature
  // (a child's are adult-sized and shrunk by its bones), so the raw box made the children as tall as the adults.
  const measure = () => { root.updateMatrixWorld(true); for (const m of skins) m.skeleton.update(); return new THREE.Box3().setFromObject(root, true); };
  const box = measure();
  root.scale.multiplyScalar(height / Math.max(0.01, box.max.y - box.min.y));
  root.position.y -= measure().min.y;
  // Runners lean a little further into the run, pivoting at the feet.
  const lean = new THREE.Group(); lean.add(root);
  if (speed > 2.5) lean.rotation.x = 0.08;
  const holder = new THREE.Group(); holder.name = id; holder.add(lean);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(held ?? retarget(assets, model, clip)); action.play();
  action.time = (id.length * 0.37 + id.charCodeAt(0) * 0.11) % action.getClip().duration;
  const recorded = CLIP_SPEED[clip];
  action.timeScale = speed > 0 && recorded ? speed / (recorded * (height / HEIGHT.PlayerMale)) : 1;
  // Ankles at their standing height, in the holder's space (the body stands at its origin in the bind pose).
  const ankles: THREE.Object3D[] = [];
  root.traverse(o => { if (o.name === "CC_Base_L_Foot" || o.name === "CC_Base_R_Foot") ankles.push(o); });
  const at = new THREE.Vector3();
  const lowest = () => { let y = Infinity; for (const a of ankles) y = Math.min(y, holder.worldToLocal(a.getWorldPosition(at)).y); return y; };
  holder.updateWorldMatrix(true, true);
  const standing = ankles.length ? lowest() : 0;
  return {
    holder, root, mixer, action, height,
    ground() {
      if (!ankles.length) return;
      lean.position.y = 0;
      holder.updateWorldMatrix(true, true);
      const sunk = standing - lowest();
      // Only ever up, and by what a leg-length mismatch can explain: a body that kneels or crawls stays down.
      if (sunk > 0.004 && sunk < 0.2) lean.position.y = sunk / Math.max(1e-3, holder.scale.y);
    },
    setOpacity(value: number) {
      const next = Math.min(1, Math.max(0, value));
      if (Math.abs(next - opacity) < 0.004) return;
      opacity = next; holder.visible = next > 0.01;
      for (const m of materials) m.opacity = next;
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); for (const m of materials) m.dispose(); },
  };
}

type Actor = Body & { occupant: Occupant; accumulated: number; frame: number };

export function createCharacters(assets: CharacterAssets, parent: THREE.Object3D, initialTier: Tier) {
  const group = new THREE.Group(); group.name = "occupants"; parent.add(group);
  const actors: Actor[] = OCCUPANTS.map(occupant => {
    const body = spawnBody(assets, occupant.id, occupant.model, occupant.clip, occupant.dir !== 0 ? occupant.speed : 0);
    group.add(body.holder);
    return { ...body, occupant, accumulated: 0, frame: 0 };
  });
  let tier = initialTier, active = actors.length, lineup = false;
  const world = new THREE.Vector3();
  return {
    group, actors,
    /** Diagnostic: stand everyone in a row facing +Z at z = 40 to inspect rigs and skinning. */
    setLineup(on: boolean) { lineup = on; },
    /** Diagnostic: play one named clip on every actor (clip names come from animations.glb). */
    debugPlay(clipName: string) { for (const a of actors) { if (!(clipName in assets.clips)) continue; a.mixer.stopAllAction(); a.action = a.mixer.clipAction(retarget(assets, a.occupant.model, clipName as ClipId)); a.action.timeScale = 1; a.action.play(); } },
    setBudget(count: number, nextTier: Tier) { active = Math.min(actors.length, count); tier = nextTier; actors.forEach((a, i) => { if (i >= active) a.holder.visible = false; }); },
    /** `camera` decides animation LOD; `time` is the shared scene clock. */
    update(delta: number, time: number, camera: THREE.Camera) {
      let animated = 0;
      for (let i = 0; i < active; i++) {
        const a = actors[i], pose = occupantPose(a.occupant, time);
        if (lineup) { a.holder.position.set((i - (active - 1) / 2) * 1.0, 0, 40); a.holder.rotation.y = 0; }
        else { a.holder.position.set(pose.position[0], pose.position[1], pose.position[2]); a.holder.rotation.y = pose.yaw; }
        a.setOpacity(lineup ? 1 : pose.visibility);
        a.holder.getWorldPosition(world);
        const interval = animationInterval(world.distanceTo(camera.position), tier);
        a.accumulated += delta;
        if (++a.frame % interval === 0) { a.mixer.update(a.accumulated); a.ground(); a.accumulated = 0; animated++; }
      }
      return animated;
    },
    dispose() { for (const a of actors) a.dispose(); parent.remove(group); },
  };
}
