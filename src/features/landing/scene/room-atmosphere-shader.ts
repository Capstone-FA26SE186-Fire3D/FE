export const atmosphereVertex = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const atmosphereFragment = `
uniform float uTime, uGrowth, uSmoke, uSeed, uStrength, uCeiling;
uniform vec3 uOrigin, uMin, uMax;
uniform sampler3D uNoise;
uniform sampler2D uDepth;
uniform vec2 uResolution;
uniform mat4 uInverseProjection,uCameraWorld;
uniform mat4 uFieldMatrix;
uniform float uRoof;
uniform float uIgnition;
uniform float uOpacity;
varying vec3 vWorld;
float hash(vec3 p) {
  p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  return texture(uNoise, p/32.).r;
}
float turbulence(vec3 p) {
  return noise3(p)*.72 + noise3(p*2.03)*.28;
}
void main() {
  if(uOpacity<.001) discard;
  float growth=smoothstep(uIgnition,uIgnition+32.,uTime);
  vec3 direction = normalize(vWorld - cameraPosition);
  vec3 inverseRay = 1. / (sign(direction) * max(abs(direction), vec3(.00001)) + vec3(.0000001));
  vec3 a = (uMin-cameraPosition)*inverseRay, b = (uMax-cameraPosition)*inverseRay;
  vec3 nearPlane = min(a,b), farPlane = max(a,b);
  float start = max(0., max(max(nearPlane.x,nearPlane.y),nearPlane.z));
  float end = min(min(farPlane.x,farPlane.y),farPlane.z);
  // Stop at the nearest opaque receiver, even when it lies inside this volume.
  vec2 screenUv=gl_FragCoord.xy/uResolution;
  float depth=texture2D(uDepth,screenUv).r;
  vec4 viewPosition=uInverseProjection*vec4(screenUv*2.-1.,depth*2.-1.,1.);
  vec3 opaqueWorld=(uCameraWorld*vec4(viewPosition.xyz/viewPosition.w,1.)).xyz;
  end=min(end,length(opaqueWorld-cameraPosition));
  if (end <= start || (uGrowth < .001 && uSmoke < .001)) discard;
  float stepLength = (end-start)/float(MARCH_STEPS);
  float jitter = hash(floor(vWorld*190.));
  vec4 result = vec4(0.);
  for (int i=0; i<MARCH_STEPS; i++) {
    vec3 world = cameraPosition + direction*(start+(float(i)+jitter)*stepLength);
    vec3 p = (uFieldMatrix*vec4(world,1.)).xyz;
    vec3 flow = p*vec3(2.2,2.1,2.2) + vec3(uSeed,-uTime*1.2,-uTime*.36);
    float curl = turbulence(flow*.65);
    float detail = turbulence(flow + vec3(curl*1.8,0.,curl));
    float lateSpread=smoothstep(uIgnition+20.,uIgnition+65.,uTime);
    float edgeWidth=mix(.45,.12,lateSpread);
    float sideEdge = smoothstep(0.,edgeWidth,p.x)*(1.-smoothstep(3.4-edgeWidth,3.4,p.x));
    float burnCenter = .65+hash(vec3(uSeed+1.))*2.1;
    float spreadWidth = mix(.45+growth*(.65+uStrength),4.2,lateSpread);
    float burnMask = 1.-smoothstep(spreadWidth*.4,spreadWidth,abs(p.x-burnCenter)+(curl-.5)*.65);
    float bottomEdge = smoothstep(.25,.65+curl*.35,p.y);
    float wall = 1.-smoothstep(.06+curl*.12,.32+curl*.45,p.z);
    float ceiling = smoothstep(2.55,3.08,p.y);
    float reach = mix(growth*(2.7+uStrength*4.1),9.,lateSpread);
    float advance = 1.-smoothstep(reach-.5,reach+.6,p.y+p.z*.7+curl*.8);
    float density = max(wall,ceiling)*sideEdge*burnMask*bottomEdge*advance;
    if(uRoof>.5){
      float roofFront=1.-smoothstep(growth*5.-.5,growth*5.+.5,p.z+curl);
      float heightMask=(1.-smoothstep(.2+curl*.3,.65+curl*.55,p.y))*smoothstep(0.,.1,p.y);
      density=sideEdge*burnMask*roofFront*heightMask;
    }
    // Threshold the turbulent field into billows with empty pockets; a full
    // low-density field reads as a rectangular luminous mist from the overview.
    float pockets = noise3(p*1.2+vec3(uSeed,0.,-uTime*.12));
    float billow = smoothstep(.48,.72,detail+pockets*.18);
    density *= billow*uStrength*5.5*smoothstep(0.,.08,growth);
    float smokeBase=mix(2.85,2.05,uSmoke);
    float smokeDensity = uCeiling*uSmoke*sideEdge*smoothstep(smokeBase,3.1,p.y);
    smokeDensity *= (.55+curl)*(1.-smoothstep(5.1,5.7,p.z))*4.2;
    if(uRoof>.5){
      // A drifting, tapered plume inside the integration box. Fade every open
      // boundary so the box itself never becomes the smoke silhouette.
      vec3 boundsUv=(world-uMin)/max(uMax-uMin,vec3(.001));
      vec3 boundary=min(boundsUv,1.-boundsUv);
      vec3 feather=smoothstep(vec3(0.),vec3(.22,.18,.22),boundary);
      float roofSmoke=smoothstep(.35,.85,p.y)*(1.-smoothstep(1.8,3.2,p.y));
      vec2 centre=vec2(burnCenter,2.85)+vec2(
        sin(p.y*1.15-uTime*.3+uSeed),cos(p.y*.8-uTime*.24+uSeed))*.28*p.y;
      vec2 plume=(p.xz-centre)/vec2(.8+p.y*.3,1.35+p.y*.3);
      plume+=vec2(curl-.5,pockets-.5)*.55;
      float envelope=1.-smoothstep(.3,1.25,length(plume));
      float wisps=smoothstep(.2,.78,detail*.65+pockets*.35);
      smokeDensity+=roofSmoke*envelope*growth*wisps*feather.x*feather.y*feather.z*3.6;
    }
    vec3 hot = mix(vec3(.45,.008,.001),vec3(2.2,.22,.003),billow);
    hot = mix(hot,vec3(3.,1.3,.12),pow(billow,4.)*smoothstep(.6,.85,detail));
    float total = density+smokeDensity;
    // Dense soot absorbs the fire behind it; it is not an additive grey glow.
    vec3 color = (hot*density + vec3(.009,.01,.011)*smokeDensity)/max(total,.0001);
    float opacity = 1.-exp(-total*stepLength*uOpacity);
    result.rgb += (1.-result.a)*color*opacity;
    result.a += (1.-result.a)*opacity;
    if (result.a>.97) break;
  }
  if (result.a<.005) discard;
  gl_FragColor = vec4(result.rgb/max(result.a,.0001),result.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
