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
uniform float uJunctionClearance, uJunctionFloor;
uniform vec2 uWind;
uniform float uGust, uFlare;
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
  if(uJunctionFloor>.5 && uTime<=uIgnition) discard;
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
  if (end <= start || (uJunctionFloor < .5 && uGrowth < .001 && uSmoke < .001)) discard;
  float stepLength = (end-start)/float(MARCH_STEPS);
  float jitter = hash(floor(vWorld*190.));
  vec4 result = vec4(0.);
  for (int i=0; i<MARCH_STEPS; i++) {
    vec3 world = cameraPosition + direction*(start+(float(i)+jitter)*stepLength);
    vec3 p = (uFieldMatrix*vec4(world,1.)).xyz;
    // Advect turbulence, not the supporting surface: roots remain attached.
    vec3 windInField=(uFieldMatrix*vec4(uWind.x,0.,uWind.y,0.)).xyz;
    vec3 flow = (p-windInField*max(0.,p.y)*.35)*vec3(2.2,2.1,2.2) + vec3(uSeed,-uTime*1.2,-uTime*.36);
    if(uJunctionFloor>.5) flow=vec3(world.x*9.,p.y*7.-uTime*2.,p.z*5.+uSeed);
    float curl = turbulence(flow*.65);
    float detail = turbulence(flow + vec3(curl*1.8,0.,curl));
    float lateSpread=smoothstep(uIgnition+20.,uIgnition+65.,uTime);
    float secondarySpread=smoothstep(uIgnition+12.,uIgnition+54.,uTime);
    float tertiarySpread=smoothstep(uIgnition+34.,uIgnition+78.,uTime);
    float edgeWidth=mix(.45,.025,lateSpread);
    float sideEdge = smoothstep(-.03,edgeWidth,p.x)*(1.-smoothstep(3.4-edgeWidth,3.43,p.x));
    // Separate ignition patches eventually connect. Noise still breaks up the
    // flame silhouette; no fixed portion of the supporting wall is excluded.
    float burnCenter = .45+hash(vec3(uSeed+1.))*1.85;
    float secondCenter = .35+hash(vec3(uSeed+8.))*2.35;
    float thirdCenter = .15+hash(vec3(uSeed+16.))*2.95;
    float warp = (curl-.5)*.5 + (detail-.5)*.18;
    float flarePatch=1.-smoothstep(.18,.85,abs(p.x-secondCenter));
    float burst=(uFlare*flarePatch+uGust*(.2+.3*curl))*growth;
    float widthA = mix(.25+growth*(.24+uStrength*.12),1.08,lateSpread);
    float widthB = mix(.14,.78,secondarySpread);
    float widthC = mix(.1,.55,tertiarySpread);
    float lobeA = 1.-smoothstep(widthA*.28,widthA,abs(p.x-burnCenter)+warp);
    float lobeB = 1.-smoothstep(widthB*.3,widthB,abs(p.x-secondCenter)-warp*.7);
    float lobeC = 1.-smoothstep(widthC*.3,widthC,abs(p.x-thirdCenter)+warp*.45);
    float burnMask = max(lobeA,max(lobeB*secondarySpread,lobeC*tertiarySpread));
    burnMask = mix(burnMask,1.,lateSpread);
    float bottomEdge = smoothstep(-.02,.035,p.y);
    float thickness=min(.3,mix(.075,.29,lateSpread)*(1.+burst*.6));
    float wall = 1.-smoothstep(thickness*.25,thickness*(.8+curl*.2),p.z);
    float ceiling = smoothstep(2.55,3.08,p.y);
    float tongueField=turbulence(flow*vec3(1.05,1.75,1.)) + detail*.28;
    float tongue=smoothstep(.38,.76,tongueField);
    float flameHeight=mix(.72+hash(vec3(uSeed+23.))*1.15,3.85,lateSpread)+burst*.7;
    float verticalMask=1.-smoothstep(flameHeight-.32,flameHeight+.22,p.y+(curl-.5)*.28);
    float reach = mix(growth*(2.7+uStrength*4.1),7.4,lateSpread);
    float advance = 1.-smoothstep(reach-.5,reach+.6,p.y+p.z*.7+curl*.8);
    float density = max(wall,ceiling)*sideEdge*burnMask*bottomEdge*advance;
    // Fade the open depth boundary, not the contact with the wall/floor.
    if(uCeiling<.5 && uRoof<.5) density*=1.-smoothstep(.16,.3,p.z);
    if(uCeiling<.5) density*=verticalMask*(.58+.42*tongue);
    if(uRoof>.5){
      float roofReach=mix(growth*5.,7.,lateSpread);
      float roofFront=1.-smoothstep(roofReach-.5,roofReach+.5,p.z+curl);
      float roofHeight=min(2.6,mix(.45,1.85,lateSpread)+burst*.85);
      float heightMask=(1.-smoothstep(roofHeight*.4+curl*.3,roofHeight+curl*.45,p.y))*smoothstep(-.02,.035,p.y);
      density=sideEdge*burnMask*roofFront*heightMask;
    }
    // Threshold the turbulent field into billows with empty pockets; a full
    // low-density field reads as a rectangular luminous mist from the overview.
    float pockets = noise3(p*1.2+vec3(uSeed,0.,-uTime*.12));
    float billow = smoothstep(.48,.72,detail+pockets*.18);
    density *= billow*uStrength*mix(3.2,6.4,lateSpread)*(1.+burst*.8)*smoothstep(0.,.08,growth);
    float smokeBase=mix(2.95,1.8,uSmoke);
    float smokeDensity = uCeiling*uSmoke*sideEdge*smoothstep(smokeBase,3.1,p.y);
    float smokePockets=smoothstep(.3,.76,detail*.72+pockets*.3);
    smokeDensity *= (.42+curl)*(1.-smoothstep(5.1,5.7,p.z))*smokePockets*5.6;
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
    if(uJunctionFloor>.5){
      // Flames use the shared source renderer; this volume provides soot only.
      density=0.;
      // Wisps climb at the edges and collect overhead, leaving the signs clear.
      vec3 smokeFlow=world*vec3(1.8,2.4,1.8)-vec3(uWind.x*.4,uTime*.22,uTime*.12+uWind.y*.4);
      float soot=turbulence(smokeFlow+vec3(uSeed,0.,0.));
      float sideVeil=1.-smoothstep(.04,.23,min(screenUv.x,1.-screenUv.x));
      float overhead=smoothstep(.76,.95,screenUv.y);
      float plume=smoothstep(.25,1.1,p.y);
      vec3 boundsUv=(world-uMin)/(uMax-uMin);
      vec3 edge=min(boundsUv,1.-boundsUv);
      vec3 feather=smoothstep(vec3(0.),vec3(.07,.09,.08),edge);
      smokeDensity=max(sideVeil*.6,overhead*.85)*plume*smoothstep(.32,.7,soot)
        *feather.x*feather.y*feather.z*smoothstep(uIgnition+8.,uIgnition+48.,uTime)*1.3;
    }
    // The junction signage lives on the rear wall. Reserve its reading height
    // in the walk-through, fading back to full fire in the building overview.
    float rearZone=1.-smoothstep(-14.,-12.,world.z);
    float aboveFloor=smoothstep(.55,.8,world.y);
    // Remove the old rear wall strip as well: only scattered floor pockets
    // should remain here in the walk-through, even late in the burn timeline.
    float protectedHeight=uJunctionFloor>.5 ? aboveFloor : 1.;
    float clearance=1.-uJunctionClearance*rearZone*protectedHeight;
    density*=clearance;
    if(uJunctionFloor<.5) smokeDensity*=clearance;
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
