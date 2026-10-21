import * as THREE from "three";
import { DEVICE, SCREEN_ASPECT, fitPhone, type PhoneBox } from "./phone-fit";

function roundedFace(width: number, height: number, radius: number) {
  const s = new THREE.Shape(), x = -width / 2, y = -height / 2;
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}

/**
 * Landscape device drawn in its own small scene over the world render. Geometry, UVs and the render target all use
 * the landscape screen aspect, so the picture inside is never a rotated or stretched portrait image.
 */
export function createLandscapePhone(texture: THREE.Texture) {
  const scene = new THREE.Scene();
  const fov = 24;
  const camera = new THREE.PerspectiveCamera(fov, 1, 1, 4000);
  const device = new THREE.Group(); device.name = "android-device-landscape"; scene.add(device);

  const bodyGeometry = new THREE.ExtrudeGeometry(roundedFace(DEVICE.width, DEVICE.height, DEVICE.cornerRadius + 0.04), { depth: 0.12, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 14 });
  bodyGeometry.translate(0, 0, -0.06);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xa2adb2, metalness: 0.8, roughness: 0.25, transparent: true });
  device.add(new THREE.Mesh(bodyGeometry, bodyMaterial));

  const screenGeometry = new THREE.ShapeGeometry(roundedFace(DEVICE.screenWidth, DEVICE.screenHeight, DEVICE.cornerRadius), 18);
  const position = screenGeometry.getAttribute("position"), uv = screenGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) / DEVICE.screenWidth + 0.5, position.getY(i) / DEVICE.screenHeight + 0.5);
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: texture }, uOpacity: { value: 1 } }, transparent: true,
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform sampler2D uMap;uniform float uOpacity;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(uMap,vUv).rgb,uOpacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  });
  const screen = new THREE.Mesh(screenGeometry, screenMaterial); screen.position.z = 0.092; screen.name = "live-world-screen"; device.add(screen);
  const lensGeometry = new THREE.CircleGeometry(0.045, 20), lensMaterial = new THREE.MeshBasicMaterial({ color: 0x050708, transparent: true });
  const lens = new THREE.Mesh(lensGeometry, lensMaterial); lens.position.set(-DEVICE.width / 2 + 0.1, 0, 0.098); device.add(lens);
  const buttonGeometry = new THREE.BoxGeometry(0.24, 0.035, 0.075);
  for (const x of [0.7, 1.05]) { const b = new THREE.Mesh(buttonGeometry, bodyMaterial); b.position.set(x, DEVICE.height / 2 + 0.002, 0); device.add(b); }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x343f40, 3));
  const key = new THREE.DirectionalLight(0xffc6a1, 5); key.position.set(3, 5, 6); scene.add(key);

  let box: PhoneBox = { x: 0, y: 0, width: 1, height: 1 };
  return {
    scene, camera, get box() { return box; },
    /** Place the device (pixel box, top-left origin) in a viewport; world units are pixels at z = 0. */
    layout(viewportWidth: number, viewportHeight: number, opts?: Parameters<typeof fitPhone>[2]) {
      box = fitPhone(viewportWidth, viewportHeight, opts);
      camera.aspect = viewportWidth / viewportHeight;
      camera.position.set(0, 0, (viewportHeight / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
      camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
      const unit = box.width / DEVICE.width;
      device.scale.setScalar(unit);
      device.position.set(box.x + box.width / 2 - viewportWidth / 2, -(box.y + box.height / 2 - viewportHeight / 2), 0);
      return box;
    },
    setAmount(amount: number, time: number) {
      const a = THREE.MathUtils.smoothstep(amount, 0, 1);
      bodyMaterial.opacity = a; lensMaterial.opacity = a; screenMaterial.uniforms.uOpacity.value = a;
      device.visible = a > 0.002;
      device.rotation.y = (1 - a) * 0.6 + Math.sin(time * 0.4) * 0.03; device.rotation.x = -0.04;
    },
    screenAspect: SCREEN_ASPECT,
    dispose() { bodyGeometry.dispose(); screenGeometry.dispose(); lensGeometry.dispose(); buttonGeometry.dispose(); bodyMaterial.dispose(); screenMaterial.dispose(); lensMaterial.dispose(); scene.clear(); },
  };
}
