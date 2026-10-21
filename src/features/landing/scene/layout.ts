/*
 * Shared floor plan for the circular glass landing. Everything that depends on the building shape (camera path,
 * evacuation paths, stair/door positions, effect anchors) reads from here so none of it is tied to the old
 * rectangular building. Pure TypeScript: no three.js import, so it is unit-testable.
 *
 * Plan view, +Z towards the viewer, angle θ measured from +X towards +Z:
 *   θ = π/2 is the main door. The route walks counter-clockwise 270° (¾ of the ring) to θ = 2π.
 */

export type Vec3 = readonly [number, number, number];

export const PLAN = {
  tiers: 3,
  tierHeight: 4.2,
  slab: 0.35,
  outerRadius: 30,
  roomWallRadius: 21,
  atriumRadius: 14,
  corridorRadius: 24.5,
  corridorHalfWidth: 3.2,
  doorAngle: Math.PI / 2,
  doorWidth: 3.4,
  eyeHeight: 1.6,
} as const;

export const ROUTE = { startAngle: PLAN.doorAngle, sweep: Math.PI * 1.5 } as const;
export const ROUTE_LENGTH = PLAN.corridorRadius * ROUTE.sweep;
/** Stages of the scroll journey, as fractions of total progress. */
export const STAGE = { aerialEnd: 0.16, doorEnd: 0.3, arcEnd: 0.94 } as const;

export type Beat = "aerial" | "door" | "fire" | "evac" | "junction";
export type Pose = { position: Vec3; target: Vec3 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function arcPoint(angle: number, radius: number = PLAN.corridorRadius, y = 0): Vec3 {
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}
/** Direction of increasing θ at `angle` in the XZ plane. */
export function arcTangent(angle: number): readonly [number, number] { return [-Math.sin(angle), Math.cos(angle)]; }
export function routeAngle(fraction: number) { return ROUTE.startAngle + ROUTE.sweep * clamp01(fraction); }

const LOOK_AHEAD = 7;
const lookAhead = (angle: number): Vec3 => arcPoint(angle + LOOK_AHEAD / PLAN.corridorRadius, PLAN.corridorRadius, PLAN.eyeHeight - 0.1);

const AERIAL: Pose = { position: [0, 30, 96], target: [0, 7, 0] };
const APPROACH: Pose = { position: [0, 3.2, 50], target: [0, 2.2, 8] };
const DOOR: Vec3 = [0, PLAN.eyeHeight, PLAN.outerRadius + 1.4];

/** Camera pose for the scroll journey. A pure function of progress (and the lens), so scrolling back retraces the same path. */
export function journeyPose(progress: number, lens?: { fov: number; aspect: number }): Pose {
  const p = clamp01(progress);
  const eye = PLAN.eyeHeight;
  if (p < STAGE.aerialEnd) {
    const u = smoothstep(0, STAGE.aerialEnd, p);
    // Narrow viewports: back the aerial shot off until the whole ring fits horizontally.
    let from = AERIAL.position;
    if (lens) {
      const half = (lens.fov * Math.PI) / 360, fit = (PLAN.outerRadius + 6) / (Math.tan(half) * lens.aspect);
      const base = Math.hypot(AERIAL.position[1] - AERIAL.target[1], AERIAL.position[2]), k = Math.max(1, fit / base);
      from = [AERIAL.position[0], AERIAL.target[1] + (AERIAL.position[1] - AERIAL.target[1]) * k, AERIAL.position[2] * k];
    }
    return { position: mix(from, APPROACH.position, u), target: mix(AERIAL.target, APPROACH.target, u) };
  }
  if (p < STAGE.doorEnd) {
    const u = smoothstep(STAGE.aerialEnd, STAGE.doorEnd, p);
    const inside = arcPoint(ROUTE.startAngle, PLAN.corridorRadius, eye);
    const position = u < 0.5 ? mix(APPROACH.position, DOOR, smoothstep(0, 0.5, u)) : mix(DOOR, inside, smoothstep(0.5, 1, u));
    return { position, target: mix(APPROACH.target, lookAhead(ROUTE.startAngle), smoothstep(0.35, 1, u)) };
  }
  const f = clamp01((p - STAGE.doorEnd) / (STAGE.arcEnd - STAGE.doorEnd));
  const angle = routeAngle(f);
  return { position: arcPoint(angle, PLAN.corridorRadius, eye), target: lookAhead(angle) };
}

export function beatAt(progress: number): Beat {
  if (progress < STAGE.aerialEnd) return "aerial";
  if (progress < STAGE.doorEnd) return "door";
  const f = (progress - STAGE.doorEnd) / (STAGE.arcEnd - STAGE.doorEnd);
  return f < 0.34 ? "fire" : f < 0.68 ? "evac" : "junction";
}

export type ModelId = "PlayerMale" | "PlayerFemale" | "NpcWorker" | "NpcOfficeMale" | "NpcOfficeFemale" | "NpcSecurity" | "NpcTechnician" | "NpcCleaner" | "NpcBoy" | "NpcGirl";
/** Real character heights in metres, from the Blender cleanup (Player/Worker are the Unity heights). */
export const MODEL_HEIGHT: Record<ModelId, number> = { PlayerMale: 1.78, PlayerFemale: 1.66, NpcWorker: 1.75, NpcOfficeMale: 1.7, NpcOfficeFemale: 1.6, NpcSecurity: 1.72, NpcTechnician: 1.62, NpcCleaner: 1.55, NpcBoy: 1.33, NpcGirl: 1.38 };
export const MODEL_IDS = Object.keys(MODEL_HEIGHT) as ModelId[];
export type ClipId = "Idle" | "Walk" | "Jog" | "Terrified";
export type Occupant = {
  id: string; model: ModelId; clip: ClipId;
  /** Route fraction range the occupant stays in. A moving occupant loops inside [from, to]. */
  from: number; to: number;
  /** +1 walks towards the junction, -1 towards the door, 0 stands still at `from`. */
  dir: -1 | 0 | 1;
  /** Lateral offset from the corridor centre line, metres (positive = outer wall). */
  lateral: number;
  /** Ground speed of a moving occupant, m/s. */
  speed: number;
};

/** Ordered by priority: a lower quality tier simply uses the first N. */
export const OCCUPANTS: readonly Occupant[] = [
  { id: "player", model: "PlayerMale", clip: "Jog", from: 0.62, to: 0.9, dir: 1, lateral: -0.4, speed: 3.1 },
  { id: "worker-terrified", model: "NpcOfficeFemale", clip: "Terrified", from: 0.2, to: 0.2, dir: 0, lateral: 1.4, speed: 0 },
  { id: "female-walk", model: "NpcOfficeMale", clip: "Walk", from: 0.4, to: 0.72, dir: 1, lateral: 1.1, speed: 1.35 },
  { id: "worker-jog", model: "NpcSecurity", clip: "Jog", from: 0.12, to: 0.44, dir: -1, lateral: -1.2, speed: 3.0 },
  { id: "male-walk", model: "NpcTechnician", clip: "Walk", from: 0.5, to: 0.8, dir: 1, lateral: -1.6, speed: 1.35 },
  { id: "female-idle", model: "PlayerFemale", clip: "Idle", from: 0.86, to: 0.86, dir: 0, lateral: 1.2, speed: 0 },
  { id: "worker-walk", model: "NpcCleaner", clip: "Walk", from: 0.3, to: 0.6, dir: -1, lateral: 1.6, speed: 1.35 },
  { id: "male-idle", model: "NpcSecurity", clip: "Idle", from: 0.9, to: 0.9, dir: 0, lateral: -1.3, speed: 0 },
  { id: "female-jog", model: "NpcGirl", clip: "Jog", from: 0.52, to: 0.84, dir: 1, lateral: 0.2, speed: 3.0 },
  { id: "worker-idle", model: "NpcWorker", clip: "Idle", from: 0.78, to: 0.78, dir: 0, lateral: -0.9, speed: 0 },
  { id: "male-terrified", model: "NpcBoy", clip: "Terrified", from: 0.27, to: 0.27, dir: 0, lateral: -1.5, speed: 0 },
  { id: "female-walk-2", model: "NpcWorker", clip: "Walk", from: 0.66, to: 0.92, dir: -1, lateral: 1.8, speed: 1.35 },
];

export type OccupantPose = { position: Vec3; yaw: number; fraction: number; visibility: number };

/** Route position of an occupant at `time` seconds. Moving occupants loop, fading out/in at the loop ends. */
export function occupantPose(o: Occupant, time: number): OccupantPose {
  const span = Math.max(1e-6, (o.to - o.from) * ROUTE_LENGTH);
  let fraction = o.from;
  let visibility = 1;
  if (o.dir !== 0) {
    const travelled = (time * o.speed) % span;
    const u = travelled / span;
    fraction = o.dir > 0 ? o.from + (o.to - o.from) * u : o.to - (o.to - o.from) * u;
    visibility = Math.min(smoothstep(0, 0.05, u), 1 - smoothstep(0.95, 1, u));
  }
  const angle = routeAngle(fraction);
  const radius = PLAN.corridorRadius + o.lateral;
  const [tx, tz] = arcTangent(angle);
  const sign = o.dir === 0 ? 1 : o.dir;
  // Standing occupants face the camera's approach direction (towards the door).
  const dirX = tx * (o.dir === 0 ? -1 : sign), dirZ = tz * (o.dir === 0 ? -1 : sign);
  return { position: arcPoint(angle, radius, 0), yaw: Math.atan2(dirX, dirZ), fraction, visibility };
}

/** The fire sits in a room opening on the outer side of the corridor, ahead of the first beat. */
export const FIRE = { fraction: 0.26, radius: 27.4, height: 0 } as const;
export function firePosition(): Vec3 { return arcPoint(routeAngle(FIRE.fraction), FIRE.radius, FIRE.height); }
/** Smoke is carried along the ceiling in the direction of the route. */
export function smokeDrift(): readonly [number, number] { return arcTangent(routeAngle(FIRE.fraction)); }

/** Third-person camera that follows the Trainee player for the phone screen. */
export function followPose(fraction: number, lateral: number): Pose {
  const angle = routeAngle(fraction);
  const behind = routeAngle(fraction) - 3.4 / PLAN.corridorRadius;
  const r = PLAN.corridorRadius + lateral * 0.5;
  return { position: arcPoint(behind, r, 2.1), target: arcPoint(angle + 2 / PLAN.corridorRadius, PLAN.corridorRadius + lateral, 1.1) };
}

/* ---------------------------------------------------------------------------------------------------------------
 * Bays: the ring is cut into 8 angular bays (x 3 tiers) so the Organization branch can collapse it piece by piece.
 * Bay 0 is centred on the main door; bays are ranked by angular distance from the front.
 * ------------------------------------------------------------------------------------------------------------- */
export const BAYS = 8;
export const BAY_SPAN = (Math.PI * 2) / BAYS;
export const bayCentre = (bay: number) => PLAN.doorAngle + bay * BAY_SPAN;
export const bayRank = (bay: number) => Math.min(bay, BAYS - bay);

/** Authored demonstration timing (seconds in the Organization branch), not predicted fire propagation. */
export const COLLAPSE = { start: 110, perRank: 7, perTier: 3, duration: 6 } as const;
export const COLLAPSE_END = COLLAPSE.start + 4 * COLLAPSE.perRank + 2 * COLLAPSE.perTier + COLLAPSE.duration;
export function bayFallStart(tier: number, bay: number) { return COLLAPSE.start + bayRank(bay) * COLLAPSE.perRank + (PLAN.tiers - 1 - tier) * COLLAPSE.perTier; }
/** Roof/front first, then adjacent bays; lower floors follow the bay above. 0 = standing, 1 = down. */
export function bayFall(time: number, tier: number, bay: number) { const s = bayFallStart(tier, bay); return smoothstep(s, s + COLLAPSE.duration, time); }

export function roomFire(tier: number, bay: number) {
  const seed = tier * 19 + bay * 7;
  const ignition = 1.5 + ((bay + tier) % 3) * 6 + tier * 2;
  return { seed, ignition, strength: 0.3 + 0.65 * ((Math.sin(seed * 3.7) + 1) / 2), wall: ignition + 3, facade: ignition + 9, roof: ignition + 18 };
}

/**
 * Where the junction's two branch doors stand: side by side across the corridor, a few metres past the end of the walked
 * arc. Walking counter-clockwise, the outer (glass) side is on the left, so Trainee is left and Organization right.
 */
export function junctionDoor(branch: "trainee" | "organization") {
  const end = ROUTE.startAngle + ROUTE.sweep + 8.5 / PLAN.corridorRadius;
  const [tx, tz] = arcTangent(end);
  const radius = PLAN.corridorRadius + (branch === "trainee" ? 1.75 : -1.75);
  return { position: arcPoint(end, radius, 1.3), yaw: Math.atan2(-tx, -tz), width: 2.2, height: 2.6, angle: end };
}

export type Orbit = { yaw: number; pitch: number };
/** The subject is framed beside (wide) or above (narrow) the copy by shifting the view window by this much of the viewport. */
export const FRAME_SHIFT = 0.16;
export const ORG_FRAME = 0.9;
export const isWideFrame = (mobile: boolean, aspect: number) => !mobile && aspect > 1.2;
/**
 * Organization overview camera: a bounding sphere around the whole building is fitted against both viewport axes so a
 * side-on orbit cannot crop any bay. `yaw`/`pitch` come from the drag surface.
 */
export function orgOverview(fovDegrees: number, aspect: number, mobile: boolean, orbit: Orbit = { yaw: 0, pitch: 0 }): Pose {
  const half = (fovDegrees * Math.PI) / 360;
  // The view window is shifted to leave room for the copy, so fit the building into what remains of the shifted axis.
  const room = 1 - 2 * FRAME_SHIFT * ORG_FRAME;
  const wide = isWideFrame(mobile, aspect);
  const limiting = Math.min(Math.atan(Math.tan(half) * (wide ? 1 : room)), Math.atan(Math.tan(half) * aspect * (wide ? room : 1)));
  const radius = PLAN.outerRadius + 6, distance = (radius / Math.sin(limiting)) * (mobile ? 1.06 : 1.02);
  const target: Vec3 = [0, PLAN.tierHeight * 1.5, 0];
  const dir = [0.55, 0.5 + orbit.pitch * 0.55, 1];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const x = (dir[0] / len) * distance, y = (dir[1] / len) * distance, z = (dir[2] / len) * distance;
  const c = Math.cos(orbit.yaw), s = Math.sin(orbit.yaw);
  return { position: [x * c + z * s + target[0], y + target[1], -x * s + z * c + target[2]], target };
}
