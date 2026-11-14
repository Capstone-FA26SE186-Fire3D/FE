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

export type ModelId =
  | "PlayerMale" | "PlayerFemale" | "NpcWorker" | "NpcOfficeMale" | "NpcOfficeFemale" | "NpcSecurity" | "NpcTechnician" | "NpcCleaner" | "NpcBoy" | "NpcGirl"
  | "FirefighterBao" | "FirefighterKiet" | "FirefighterLoc" | "FirefighterNam" | "CasualBlackShirt" | "CasualBlueTee" | "CasualNavyPolo" | "CasualWhitePolo";
/** Character heights in metres, measured on the exported GLBs (scripts/export_landing_cast.py). */
export const MODEL_HEIGHT: Record<ModelId, number> = {
  PlayerMale: 1.75, PlayerFemale: 1.65, NpcWorker: 1.78, NpcOfficeMale: 1.74, NpcOfficeFemale: 1.63, NpcSecurity: 1.77, NpcTechnician: 1.62, NpcCleaner: 1.57, NpcBoy: 1.34, NpcGirl: 1.3,
  FirefighterBao: 1.75, FirefighterKiet: 1.76, FirefighterLoc: 1.78, FirefighterNam: 1.74, CasualBlackShirt: 1.74, CasualBlueTee: 1.68, CasualNavyPolo: 1.7, CasualWhitePolo: 1.75,
};
export const MODEL_IDS = Object.keys(MODEL_HEIGHT) as ModelId[];
/** Clips in animations.glb, recorded from the game's own character states (scripts/build_landing_animations.py). */
export type ClipId = "Idle" | "Walk" | "Run" | "PanicRun" | "Wave" | "HoseHold" | "CarryWalk" | "InjuredWalk" | "CrouchWalk" | "Phone" | "Sit" | "Direct" | "Cough";
/** Ground speed (m/s) each moving clip was recorded at; playback follows the actor's speed so feet do not slide. */
export const CLIP_SPEED: Partial<Record<ClipId, number>> = { Walk: 1.4, Run: 3.3, PanicRun: 3.2, CarryWalk: 1.3, InjuredWalk: 0.9, CrouchWalk: 0.85 };
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
  { id: "player", model: "PlayerMale", clip: "Run", from: 0.62, to: 0.9, dir: 1, lateral: -0.4, speed: 3.1 },
  // The firefighter in yellow works inside, half way along the walked route, sending people on to the way out.
  { id: "firefighter-inside", model: "FirefighterBao", clip: "Direct", from: 0.47, to: 0.47, dir: 0, lateral: -1.9, speed: 0 },
  // His colleague waits at the end of the walked route, waving people on to the branch doors.
  { id: "firefighter-end", model: "FirefighterKiet", clip: "Wave", from: 0.935, to: 0.935, dir: 0, lateral: 2.0, speed: 0 },
  // The four people in everyday clothes are the main crowd: they come towards the door (and the camera walking in).
  { id: "casual-out-1", model: "CasualBlackShirt", clip: "Run", from: 0.04, to: 0.4, dir: -1, lateral: 0.7, speed: 3.3 },
  { id: "casual-out-2", model: "CasualBlueTee", clip: "Run", from: 0.34, to: 0.7, dir: -1, lateral: -1.0, speed: 3.2 },
  { id: "casual-out-3", model: "CasualNavyPolo", clip: "Run", from: 0.6, to: 0.95, dir: -1, lateral: 1.0, speed: 3.4 },
  { id: "casual-out-4", model: "CasualWhitePolo", clip: "Run", from: 0.03, to: 0.34, dir: -1, lateral: 1.6, speed: 3.1 },
  { id: "casual-cough", model: "CasualWhitePolo", clip: "Cough", from: 0.62, to: 0.62, dir: 0, lateral: 1.9, speed: 0 },
  { id: "worker-terrified", model: "NpcOfficeFemale", clip: "Cough", from: 0.2, to: 0.2, dir: 0, lateral: 1.4, speed: 0 },
  { id: "female-walk", model: "NpcOfficeMale", clip: "Walk", from: 0.4, to: 0.72, dir: 1, lateral: 1.1, speed: 1.35 },
  { id: "worker-jog", model: "NpcSecurity", clip: "Run", from: 0.12, to: 0.44, dir: -1, lateral: -1.2, speed: 3.0 },
  { id: "male-walk", model: "NpcTechnician", clip: "Walk", from: 0.5, to: 0.8, dir: 1, lateral: -1.6, speed: 1.35 },
  { id: "female-idle", model: "PlayerFemale", clip: "Idle", from: 0.86, to: 0.86, dir: 0, lateral: 1.2, speed: 0 },
  { id: "worker-walk", model: "NpcCleaner", clip: "CrouchWalk", from: 0.3, to: 0.6, dir: -1, lateral: 1.6, speed: 0.9 },
  { id: "male-terrified", model: "NpcBoy", clip: "Wave", from: 0.27, to: 0.27, dir: 0, lateral: -1.5, speed: 0 },
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
/** One more room fire further along the walked route: route fraction of each. */
export const ROUTE_FIRES = [0.6] as const;
export function routeFire(fraction: number): { position: Vec3; drift: readonly [number, number] } {
  const angle = routeAngle(fraction);
  return { position: arcPoint(angle, FIRE.radius, FIRE.height), drift: arcTangent(angle) };
}

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

/** Where the Organization fire starts: a ground-floor room one bay left of the door. */
export const FIRE_ORIGIN = { tier: 0, bay: 1 } as const;
/**
 * The fire spreads from its origin room: the further a room is (round the ring and up the floors), the later it
 * catches, with an irregular delay on top, so the building burns in patches instead of every room at once.
 * `offset` moves the flames off the middle of the bay (radians) so they do not line up floor above floor.
 */
export function roomFire(tier: number, bay: number) {
  const seed = tier * 19 + bay * 7;
  const noise = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const round = Math.min(Math.abs(bay - FIRE_ORIGIN.bay), BAYS - Math.abs(bay - FIRE_ORIGIN.bay));
  const distance = round + Math.abs(tier - FIRE_ORIGIN.tier) * 1.3;
  const ignition = 1.5 + distance * 9 + noise(1) * 14;
  return { seed, ignition, strength: 0.3 + 0.65 * noise(2), offset: (noise(3) - 0.5) * 0.5, wall: ignition + 3, facade: ignition + 9, roof: ignition + 18 };
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

/**
 * The courtyard garden in the middle of the ring: trees and shrubs on a lawn. In the Organization demonstration each
 * one catches fire at `ignite` seconds (the fire reaches the courtyard from the origin side) and is charred ten
 * seconds later. Positions come from a fixed pseudo-random sequence, so the garden is the same on every visit.
 */
export type GardenPlant = { x: number; z: number; height: number; crown: number; ignite: number };
export const GARDEN_RADIUS = PLAN.atriumRadius - 1.6;
export const GARDEN: readonly GardenPlant[] = (() => {
  const plants: GardenPlant[] = [];
  const noise = (k: number) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const origin = bayCentre(FIRE_ORIGIN.bay);
  for (let i = 0; i < 16; i++) {
    const tree = i < 9, angle = noise(i) * Math.PI * 2 + i * 0.9, radius = (tree ? 2.5 : 1.2) + noise(i + 40) * (GARDEN_RADIUS - (tree ? 4 : 2.2));
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // Distance from the side of the ring where the fire starts decides when a plant catches.
    const reach = Math.hypot(x - Math.cos(origin) * PLAN.atriumRadius, z - Math.sin(origin) * PLAN.atriumRadius);
    plants.push({ x, z, height: tree ? 4.2 + noise(i + 80) * 3.2 : 1 + noise(i + 80) * 0.7, crown: tree ? 1.5 + noise(i + 120) * 0.9 : 0.8 + noise(i + 120) * 0.5, ignite: 34 + reach * 1.7 + noise(i + 160) * 8 });
  }
  return plants;
})();

/* ---------------------------------------------------------------------------------------------------------------
 * Rescue stage: what happens outside the main door while the camera is still outside (aerial view and approach).
 * The whole building burns; one firefighter hoses the facade, one waves people out at the door, one carries a child
 * out, and the fourth works inside, half way along the walked route (see OCCUPANTS); everybody else runs.
 * Plan: the door is at (0, 30) and faces +Z, towards the opening camera.
 * ------------------------------------------------------------------------------------------------------------- */
export type Vec2 = readonly [number, number];
const DOOR_OUT: Vec2 = [0, PLAN.outerRadius + 0.6];
export const ASSEMBLY: Vec2 = [21, 52];
const OUT_A: readonly Vec2[] = [DOOR_OUT, [1.5, 35], [9.5, 42], [17, 48.5], ASSEMBLY];
const OUT_B: readonly Vec2[] = [DOOR_OUT, [-2, 36], [-7, 45], [-9, 56], [-4, 66]];
/**
 * Two stairs stand on the inner side of the corridor, left and right of the door (`side` = +1 / -1): one flight from
 * the top floor to the first floor, the next from the first floor to the ground, turning towards the door.
 */
export const STAIR = { top: 1.05, middle: 0.75, foot: 0.45, radius: 22.3, width: 1.7, steps: 24 } as const;
const stairPoint = (side: number, offset: number): Vec2 => { const p = arcPoint(PLAN.doorAngle + side * offset, STAIR.radius); return [p[0], p[2]]; };
const corridorPoint = (side: number, offset: number): Vec2 => { const p = arcPoint(PLAN.doorAngle + side * offset, PLAN.corridorRadius - 0.6); return [p[0], p[2]]; };
const DOOR_IN: Vec2 = [0, PLAN.outerRadius - 2.2];
/** A way down from an upper floor: along the corridor of that floor to the stair head, down the flights, out of the door. */
function stairRoute(side: number, floor: 1 | 2, out: readonly Vec2[]) {
  const h = PLAN.tierHeight, head = floor === 2 ? STAIR.top : STAIR.middle;
  const points: Vec2[] = [corridorPoint(side, head + 0.75), corridorPoint(side, head + 0.4), stairPoint(side, head)];
  const heights: number[] = [floor * h, floor * h, floor * h];
  if (floor === 2) { points.push(stairPoint(side, (STAIR.top + STAIR.middle) / 2), stairPoint(side, STAIR.middle)); heights.push(1.5 * h, h); }
  points.push(stairPoint(side, (STAIR.middle + STAIR.foot) / 2), stairPoint(side, STAIR.foot), corridorPoint(side, 0.2), DOOR_IN, ...out);
  heights.push(0.5 * h, 0, 0, 0, ...out.map(() => 0));
  return { points, heights };
}
const DOWN = [stairRoute(1, 2, OUT_B), stairRoute(-1, 1, OUT_A), stairRoute(-1, 2, OUT_A), stairRoute(1, 1, OUT_B)];
/** Ways out, as XZ polylines. 0 is the marked evacuation route to the assembly point; 3..6 start on the upper floors. */
export const ESCAPE_PATHS: readonly (readonly Vec2[])[] = [
  OUT_A,
  OUT_B,
  [DOOR_OUT, [3, 37], [7, 49], [10, 62], [12, 72]],
  ...DOWN.map(d => d.points),
];
/** Height (m) of each point of an escape path; paths on the ground have none. */
export const ESCAPE_HEIGHTS: readonly (readonly number[] | undefined)[] = [undefined, undefined, undefined, ...DOWN.map(d => d.heights)];
export const ENGINE = { position: [-24, 0, 51] as Vec3, yaw: 2.2 } as const;
/** Where the hose jet lands: a burning first-floor window left of the door. */
export const JET_TARGET: Vec3 = arcPoint(PLAN.doorAngle + 0.52, PLAN.outerRadius - 0.2, PLAN.tierHeight + 2.3);

export type RescueActor = {
  id: string; model: ModelId; clip: ClipId;
  /** Standing actors: where and which way. */
  at?: Vec3; faces?: Vec2;
  /** Moving actors: which escape path, lateral offset (m), speed (m/s) and where in the loop they start (0..1). */
  path?: number; lateral?: number; speed?: number; phase?: number;
  /** A child carried in the arms. */
  carries?: ModelId;
};

/** Ordered by priority: a lower quality tier draws the first N. The firefighters always come first. */
export const RESCUE_CAST: readonly RescueActor[] = [
  { id: "hose", model: "FirefighterKiet", clip: "HoseHold", at: [-11.5, 0, 44.5], faces: [JET_TARGET[0], JET_TARGET[2]] },
  { id: "door", model: "FirefighterLoc", clip: "Wave", at: [2.9, 0, 31.9], faces: [-1.5, 36] },
  { id: "carrier", model: "FirefighterNam", clip: "Walk", path: 0, lateral: -0.5, speed: 1.5, phase: 0.3, carries: "NpcBoy" },
  { id: "casual-panic", model: "CasualBlackShirt", clip: "Run", path: 1, lateral: 0.4, speed: 3.4, phase: 0.1 },
  { id: "casual-run", model: "CasualBlueTee", clip: "Run", path: 0, lateral: 0.7, speed: 3.2, phase: 0.62 },
  { id: "casual-run-2", model: "CasualWhitePolo", clip: "Run", path: 1, lateral: -0.8, speed: 3.3, phase: 0.6 },
  { id: "casual-panic-2", model: "CasualNavyPolo", clip: "Run", path: 2, lateral: -0.6, speed: 3.5, phase: 0.45 },
  { id: "girl", model: "NpcGirl", clip: "Run", path: 0, lateral: 0.1, speed: 3.0, phase: 0.05 },
  { id: "office-f", model: "NpcOfficeFemale", clip: "Run", path: 2, lateral: 0.8, speed: 3.2, phase: 0.85 },
  { id: "trapped", model: "NpcWorker", clip: "Wave", at: arcPoint(PLAN.doorAngle - 0.42, PLAN.outerRadius - 1.1, PLAN.tierHeight), faces: [12, 70] },
  { id: "security", model: "NpcOfficeMale", clip: "InjuredWalk", path: 0, lateral: -1.3, speed: 1.0, phase: 0.72 },
  { id: "cough", model: "NpcCleaner", clip: "Cough", at: [ASSEMBLY[0] - 1.4, 0, ASSEMBLY[1] + 1.5], faces: [0, 30] },
  { id: "player", model: "PlayerMale", clip: "Run", path: 2, lateral: 0.1, speed: 3.3, phase: 0.2 },
  // From the upper floors, down the stairs and out.
  { id: "down-1", model: "NpcOfficeMale", clip: "Run", path: 3, lateral: 0.5, speed: 2.9, phase: 0.05 },
  { id: "down-2", model: "NpcCleaner", clip: "Run", path: 4, lateral: -0.5, speed: 2.8, phase: 0.4 },
  { id: "down-3", model: "NpcTechnician", clip: "Run", path: 5, lateral: 0.6, speed: 3.0, phase: 0.7 },
  { id: "down-4", model: "PlayerFemale", clip: "Run", path: 6, lateral: -0.4, speed: 2.9, phase: 0.25 },
  { id: "down-5", model: "NpcWorker", clip: "Run", path: 3, lateral: -0.6, speed: 3.0, phase: 0.55 },
  { id: "down-6", model: "NpcSecurity", clip: "Run", path: 5, lateral: -0.3, speed: 2.8, phase: 0.15 },
  { id: "phone", model: "NpcTechnician", clip: "Phone", at: [ASSEMBLY[0] + 1.6, 0, ASSEMBLY[1] + 0.8], faces: [0, 30] },
  { id: "waiting", model: "NpcWorker", clip: "Idle", at: [ASSEMBLY[0] + 0.3, 0, ASSEMBLY[1] + 2.6], faces: [0, 30] },
];

function pathAt(path: readonly Vec2[], u: number, heights?: readonly number[]) {
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); lengths.push(l); total += l; }
  let left = clamp01(u) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] > 0 ? Math.min(1, left / lengths[i]) : 0, a = path[i], b = path[i + 1];
      return { point: [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] as Vec2, dir: [(b[0] - a[0]) / lengths[i], (b[1] - a[1]) / lengths[i]] as Vec2, total, y: heights ? lerp(heights[i], heights[i + 1], t) : 0 };
    }
    left -= lengths[i];
  }
  return { point: path[0], dir: [0, 1] as Vec2, total, y: 0 };
}
export function escapePathLength(i: number) { return pathAt(ESCAPE_PATHS[i], 0).total; }

/** Where a rescue actor is at `time` seconds. Runners loop door -> end of their path, fading in at the door and out at the end. */
export function rescuePose(a: RescueActor, time: number): OccupantPose {
  if (a.path === undefined) {
    const at = a.at ?? [0, 0, 0], faces = a.faces ?? [at[0], at[2] + 1];
    return { position: at, yaw: Math.atan2(faces[0] - at[0], faces[1] - at[2]), fraction: 0, visibility: 1 };
  }
  const path = ESCAPE_PATHS[a.path], total = escapePathLength(a.path);
  const u = ((time * (a.speed ?? 1)) / total + (a.phase ?? 0)) % 1;
  const { point, dir, y } = pathAt(path, u, ESCAPE_HEIGHTS[a.path]);
  // The lateral offset opens up after the door (everyone squeezes through the same opening).
  const side = (a.lateral ?? 0) * (ESCAPE_HEIGHTS[a.path] ? smoothstep(0.62, 0.8, u) : smoothstep(0, 0.18, u));
  const x = point[0] + dir[1] * side, z = point[1] - dir[0] * side;
  return { position: [x, y, z], yaw: Math.atan2(dir[0], dir[1]), fraction: u, visibility: Math.min(smoothstep(0, 0.04, u), 1 - smoothstep(0.94, 1, u)) };
}

/** 1 while the camera is outside (aerial view, approach), 0 once it is through the door. */
export function outsideAmount(progress: number) { return 1 - smoothstep(STAGE.doorEnd - 0.07, STAGE.doorEnd - 0.01, progress); }

/**
 * The opening fire is a limited one (the fire that takes the whole building is the Organization demonstration): a
 * main seat on the first floor left of the door, where the hose is aimed, that has reached the floor above, and two
 * smaller patches elsewhere. Offsets are radians from the door; nothing burns in the doorway.
 */
const FIRE_SEATS: readonly { offset: number; tier: number; scale: number; lift?: number }[] = [
  { offset: 0.5, tier: 1, scale: 1.7 }, { offset: 0.62, tier: 1, scale: 1.3 }, { offset: 0.39, tier: 1, scale: 1.0 },
  { offset: 0.56, tier: 2, scale: 1.2 }, { offset: 0.71, tier: 2, scale: 0.8 },
  { offset: -0.98, tier: 2, scale: 1.1 }, { offset: -1.1, tier: 2, scale: 0.7 },
  { offset: 1.32, tier: 0, scale: 0.8 },
  { offset: 0.58, tier: 3, scale: 1.5, lift: -1.2 },
];
export function facadeFires(): { position: Vec3; scale: number }[] {
  return FIRE_SEATS.map(f => ({ position: arcPoint(PLAN.doorAngle + f.offset, PLAN.outerRadius + (f.tier === 3 ? -3 : 0.15), f.tier * PLAN.tierHeight + 1.5 + (f.lift ?? 0)), scale: f.scale }));
}
