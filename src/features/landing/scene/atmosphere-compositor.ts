import * as THREE from "three";
import type { createRoomAtmosphere } from "./room-atmosphere";

type Atmosphere = ReturnType<typeof createRoomAtmosphere>;

function createBuffers() {
  const world = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  world.depthTexture = depth;
  const volume = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  return { world, volume, depth };
}

/** The same renderer draws sharp geometry and a depth-clipped, half-size volume. */
export function createAtmosphereCompositor(renderer: THREE.WebGLRenderer, atmosphere: Atmosphere, mobile: boolean) {
  const buffers = { main: createBuffers(), phone: createBuffers() };
  const volumeScene = new THREE.Scene(); volumeScene.add(atmosphere.group);
  const compositeScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      uWorld: { value: buffers.main.world.texture }, uVolume: { value: buffers.main.volume.texture },
      uDepth: { value: buffers.main.world.depthTexture }, uSize: { value: new THREE.Vector2(1, 1) },
      uNear: { value: .06 }, uFar: { value: 140 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `
      uniform sampler2D uWorld,uVolume,uDepth;uniform vec2 uSize;uniform float uNear,uFar;
      varying vec2 vUv;
      float distanceAt(vec2 uv){float z=texture2D(uDepth,uv).r;return uNear*uFar/(uFar-z*(uFar-uNear));}
      void main(){
        vec2 grid=vUv*uSize-.5, cell=floor(grid), f=fract(grid);
        float centerDepth=distanceAt(vUv), total=0.;vec4 volume=vec4(0.);
        for(int i=0;i<4;i++){
          vec2 offset=vec2(float(i-int(i/2)*2),float(i/2));
          vec2 uv=(cell+offset+.5)/uSize;
          vec2 bilinear=mix(1.-f,f,offset);
          float weight=bilinear.x*bilinear.y*exp(-abs(distanceAt(uv)-centerDepth)*3.);
          volume+=texture2D(uVolume,uv)*weight;total+=weight;
        }
        volume/=max(total,.00001);
        // Transparent volume render targets store premultiplied accumulated RGB.
        gl_FragColor=vec4(volume.rgb+texture2D(uWorld,vUv).rgb*(1.-volume.a),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new THREE.Mesh(geometry, material); quad.frustumCulled = false; compositeScene.add(quad);
  const drawingSize = new THREE.Vector2(), clearColor = new THREE.Color();

  return {
    draw(scene: THREE.Scene, camera: THREE.PerspectiveCamera, destination: THREE.WebGLRenderTarget | null) {
      const pair = destination ? buffers.phone : buffers.main;
      if (destination) drawingSize.set(destination.width, destination.height);
      else renderer.getDrawingBufferSize(drawingSize);
      const width = Math.max(1, Math.round(drawingSize.x)), height = Math.max(1, Math.round(drawingSize.y));
      const scale = mobile ? .4 : .5;
      pair.world.setSize(width, height);
      pair.volume.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      const previousTarget = renderer.getRenderTarget(), previousAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      try {
        renderer.setRenderTarget(pair.world); renderer.render(scene, camera);
        atmosphere.configureView(pair.depth, camera, pair.volume.width, pair.volume.height);
        renderer.setClearColor(0x000000, 0);
        renderer.setRenderTarget(pair.volume); renderer.render(volumeScene, camera);
        material.uniforms.uWorld.value = pair.world.texture;
        material.uniforms.uVolume.value = pair.volume.texture;
        material.uniforms.uDepth.value = pair.world.depthTexture;
        material.uniforms.uSize.value.set(pair.volume.width, pair.volume.height);
        material.uniforms.uNear.value = camera.near; material.uniforms.uFar.value = camera.far;
        renderer.setRenderTarget(destination); renderer.render(compositeScene, quadCamera);
      } finally {
        renderer.setClearColor(clearColor, previousAlpha); renderer.setRenderTarget(previousTarget);
      }
    },
    dispose() {
      Object.values(buffers).forEach(({ world, volume }) => { world.dispose(); volume.dispose(); });
      geometry.dispose(); material.dispose(); compositeScene.clear(); volumeScene.clear();
    },
  };
}
