/**
 * Flame, smoke and ember sprites drawn in the half-resolution atmosphere pass.
 *
 * Output is premultiplied (blend ONE / ONE_MINUS_SRC_ALPHA) so each kind picks
 * its own look through alpha: flames are mostly additive (low alpha, high RGB)
 * with a darker rim that occludes, smoke is a dark over-blend, embers are pure
 * additive. All three read the opaque depth texture, so they fade softly where
 * they meet geometry and disappear behind walls.
 */

const depthChunk = `
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform mat4 uInverseProjection;
// Distance along the view axis to the nearest opaque surface under this pixel.
float sceneViewDepth() {
  vec2 screen = gl_FragCoord.xy / uResolution;
  float depth = texture2D(uDepth, screen).r;
  vec4 view = uInverseProjection * vec4(screen * 2. - 1., depth * 2. - 1., 1.);
  return -view.z / view.w;
}
`;

const hiddenVertex = `gl_Position = vec4(2., 2., 2., 1.); return;`;

export const flameVertex = `
attribute vec4 aPos;    // base xyz, intensity (visibility x flicker)
attribute vec4 aShape;  // seed, width, height, kind (1 = low floor fire)
uniform float uTime;
uniform vec2 uWind;
varying vec2 vUv;
varying vec4 vParam;
varying float vViewZ;
void main() {
  if (aPos.w < .003) { ${hiddenVertex} }
  vUv = uv;
  vec3 base = aPos.xyz;
  // Vertical-axis billboard: always faces the camera, never leans like crossed cards.
  vec3 toCamera = cameraPosition - base; toCamera.y = 0.;
  vec3 facing = normalize(toCamera + vec3(1e-4, 0., 0.));
  vec3 right = vec3(facing.z, 0., -facing.x);
  float height = aShape.z, width = aShape.y;
  vec3 world = base + right * (uv.x - .5) * width + vec3(0., uv.y * height, 0.);
  // Wind licks the tip downwind; the lean grows with the square of height.
  float tip = uv.y * uv.y;
  world.xz += uWind * tip * .55 * height;
  vec4 mv = viewMatrix * vec4(world, 1.);
  vViewZ = -(viewMatrix * vec4(base + vec3(0., height * .35, 0.), 1.)).z;
  vParam = vec4(aShape.x, aPos.w, aShape.w, width);
  gl_Position = projectionMatrix * mv;
}`;

export const flameFragment = `
uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec4 vParam;
varying float vViewZ;
${depthChunk}
void main() {
  float seed = vParam.x, intensity = vParam.y, kind = vParam.z;
  vec2 uv = vUv;
  float y = uv.y;
  float speed = mix(1., .72, kind);
  // Two upward-scrolling noise layers with different speeds: the slow one bends the
  // whole tongue, the fast one tears the rim and the tip.
  vec4 slow = texture2D(uNoise, vec2(uv.x * .5 + seed * .173, y * .34 - uTime * .55 * speed + seed * .31));
  vec4 fast = texture2D(uNoise, vec2(uv.x * 1.25 + seed * .291 + slow.g * .2, y * .85 - uTime * 1.5 * speed));
  float sway = (slow.r - .5) * .8 * y + sin(uTime * 1.9 + seed * 3.1) * .06 * y;
  float cx = (uv.x - .5) * 2. - sway;
  // Teardrop: broad, bright foot; narrow licking tip.
  float envelope = pow(max(1. - y, 0.), .7) * (.6 + .4 * smoothstep(0., .26, y));
  float halfWidth = mix(.92, 1.15, kind) * envelope * (1. + (fast.g - .5) * .75 * y);
  float d = abs(cx) / max(halfWidth, .001);
  float body = 1. - smoothstep(.4, 1., d);
  // Tips detach: the cut-off height falls as the noise rises.
  float lick = smoothstep(0., .32, fast.r * .7 + slow.b * .4 + (1. - y) * .95 - .74);
  float alpha = body * lick * smoothstep(0., .06, y);
  // Temperature falls with height and with distance from the axis.
  float heat = clamp((1. - y * .9) * (1. - d * .75) * (.8 + .5 * fast.b), 0., 1.);
  vec3 colour = mix(vec3(.42, .018, .0), vec3(1., .27, .014), smoothstep(.08, .42, heat));
  colour = mix(colour, vec3(1., .6, .09), smoothstep(.38, .7, heat));
  colour = mix(colour, vec3(1., .88, .52), smoothstep(.74, 1., heat) * .9);
  // Soft contact with geometry, and a fade as the camera passes through a flame.
  float contact = clamp((sceneViewDepth() - (vViewZ - max(.22, vParam.w * .45))) / .45, 0., 1.);
  float near = smoothstep(.25, 1.1, vViewZ);
  alpha *= contact * near * min(intensity, 1.);
  float gain = 1.15 + intensity * .85;
  // Hot core adds light; the cool rim also occludes what is behind it.
  float occlusion = mix(.7, .1, smoothstep(.3, .75, heat));
  gl_FragColor = vec4(colour * alpha * gain, alpha * occlusion);
}`;

export const smokeVertex = `
attribute vec4 aPos;    // source xyz, intensity
attribute vec4 aShape;  // seed, breadth, height, unused
attribute vec2 aDrift;
uniform float uTime;
uniform vec2 uWind;
varying vec2 vUv;
varying vec4 vParam;
varying float vViewZ;
void main() {
  if (aPos.w < .003) { ${hiddenVertex} }
  vUv = uv;
  float seed = aShape.x;
  float life = fract(seed + uTime * (.065 + .025 * fract(seed * 17.)));
  vec3 offset = vec3(
    sin(seed * 73. + life * 3.) * (.15 + life * .65) * aShape.y,
    life * 2.65 * aShape.z,
    cos(seed * 47.) * (.15 + life * .7) * aShape.y);
  offset.xz += (aDrift + uWind * .65) * life * life * 2.;
  vec4 mv = viewMatrix * vec4(aPos.xyz + offset + vec3(0., .35, 0.), 1.);
  float angle = seed * 39. + life * .6;
  mat2 turn = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 shape = vec2(.8 + .4 * fract(seed * 31.), 1. + .5 * fract(seed * 13.));
  mv.xy += turn * ((uv - .5) * shape) * (.38 + life * 1.6);
  vViewZ = -mv.z;
  vParam = vec4(seed, life, aPos.w, offset.y);
  gl_Position = projectionMatrix * mv;
}`;

export const smokeFragment = `
uniform float uTime;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec4 vParam;
varying float vViewZ;
${depthChunk}
void main() {
  float seed = vParam.x, life = vParam.y, intensity = min(vParam.z, 1.), rise = vParam.w;
  vec2 flow = vUv * 1.7 + vec2(seed * 7.1, seed * 3.3 - uTime * .05);
  vec4 broad = texture2D(uNoise, flow);
  vec4 detail = texture2D(uNoise, flow * 2.3 + broad.rg * .4 + vec2(.5, .2));
  float cloud = broad.r * .6 + detail.g * .4;
  float radial = 1. - smoothstep(.1, .5, length(vUv - .5 + (broad.gb - .5) * .2));
  vec2 edge = min(vUv, 1. - vUv);
  float boundary = smoothstep(0., .16, edge.x) * smoothstep(0., .16, edge.y);
  float lifeFade = smoothstep(0., .14, life) * (1. - smoothstep(.7, 1., life));
  float alpha = boundary * radial * lifeFade * smoothstep(.34, .7, cloud) * .66 * intensity;
  alpha *= clamp((sceneViewDepth() - vViewZ + .4) / .9, 0., 1.) * smoothstep(.3, 1.4, vViewZ);
  // Soot is near black. Close to the fire it catches orange light from below;
  // higher up it cools and darkens, so the ceiling reads as the densest layer.
  float warm = pow(1. - life, 3.) * clamp(1. - rise * .5, 0., 1.);
  vec3 soot = mix(vec3(.016, .015, .015), vec3(.005, .0055, .0065), smoothstep(0., 2.6, rise)) * (.55 + cloud);
  vec3 colour = soot + vec3(.55, .13, .02) * warm * .22 * (.4 + cloud);
  gl_FragColor = vec4(colour * alpha, alpha);
}`;

export const emberVertex = `
attribute vec4 aPos;    // source xyz, intensity
attribute vec4 aShape;  // seed, breadth, height, unused
attribute vec2 aDrift;
uniform float uTime;
uniform vec2 uWind;
uniform vec2 uResolution;
varying vec2 vUv;
varying vec4 vParam;
varying float vViewZ;
void main() {
  if (aPos.w < .003) { ${hiddenVertex} }
  vUv = uv;
  float seed = aShape.x;
  float life = fract(seed * 3.7 + uTime * (.2 + .25 * fract(seed * 7.3)));
  float rise = life * (1.1 + 2.4 * fract(seed * 5.1)) * aShape.z;
  vec3 offset = vec3((fract(seed * 13.1) - .5) * .5 * aShape.y, rise, (fract(seed * 17.7) - .5) * .5 * aShape.y);
  offset.x += sin(life * 9. + seed * 40.) * .1 * life;
  offset.z += cos(life * 7. + seed * 23.) * .1 * life;
  offset.xz += (aDrift + uWind * 1.2) * life * life * 1.3;
  vec4 mv = viewMatrix * vec4(aPos.xyz + offset + vec3(0., .12, 0.), 1.);
  float size = .014 + .014 * fract(seed * 29.);
  // Never thinner than about a pixel, or distant embers shimmer in and out.
  float pixel = 2. * max(-mv.z, .1) / (projectionMatrix[1][1] * uResolution.y);
  size = max(size, pixel * 1.1);
  mv.xy += (uv - .5) * 2. * size;
  vViewZ = -mv.z;
  vParam = vec4(seed, life, aPos.w, 0.);
  gl_Position = projectionMatrix * mv;
}`;

export const emberFragment = `
uniform float uTime;
varying vec2 vUv;
varying vec4 vParam;
varying float vViewZ;
${depthChunk}
void main() {
  float seed = vParam.x, life = vParam.y, intensity = min(vParam.z, 1.);
  if (vViewZ > sceneViewDepth() + .04) discard;
  float disc = 1. - smoothstep(.15, 1., length(vUv - .5) * 2.);
  float flicker = .55 + .45 * sin(uTime * (14. + 10. * fract(seed * 9.)) + seed * 60.);
  float fade = pow(1. - life, 1.3) * smoothstep(0., .06, life);
  vec3 colour = mix(vec3(1., .22, .02), vec3(1., .78, .32), pow(1. - life, 2.));
  float strength = disc * fade * flicker * intensity;
  gl_FragColor = vec4(colour * strength * 3., 0.);
}`;
