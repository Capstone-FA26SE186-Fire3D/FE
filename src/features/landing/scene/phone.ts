import * as THREE from "three";
function roundedFace(width: number, height: number, radius: number) {
  const s = new THREE.Shape(), x = -width / 2, y = -height / 2;
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y);
  s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  return s;
}

/** A second scene, not a second renderer. The world texture is the actual camera render. */
export function createPhone(texture: THREE.Texture) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .01, 30); camera.position.z = 8;
  const phone = new THREE.Group(); phone.name = "android-device"; scene.add(phone);
  const geometry = new THREE.ExtrudeGeometry(roundedFace(1.68, 3.42, .23), { depth: .12, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 3, steps: 1, curveSegments: 16 });
  geometry.translate(0, 0, -.06);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xa2adb2, metalness: .8, roughness: .23, transparent: true });
  phone.add(new THREE.Mesh(geometry, bodyMaterial));
  const screenGeometry = new THREE.ShapeGeometry(roundedFace(1.58, 3.29, .2), 20);
  const positions = screenGeometry.getAttribute("position"), uv = screenGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / 1.58 + .5, positions.getY(i) / 3.29 + .5);
  const screenMaterial = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: texture }, uAspect: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform sampler2D uMap;uniform float uAspect;uniform float uOpacity;varying vec2 vUv;
      void main(){vec2 uv=vec2((vUv.x-.5)*(.492/uAspect)+.5,vUv.y);gl_FragColor=vec4(texture2D(uMap,uv).rgb,uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    transparent: true,
  });
  // The extruded body reaches +.085 including its bevel; the display must sit in front.
  const screen = new THREE.Mesh(screenGeometry, screenMaterial); screen.position.z = .092; screen.name = "live-world-screen"; phone.add(screen);
  const lensGeometry = new THREE.CircleGeometry(.045, 20), lensMaterial = new THREE.MeshBasicMaterial({ color: 0x050708, transparent: true });
  const lens = new THREE.Mesh(lensGeometry, lensMaterial); lens.position.set(0, 1.5, .098); phone.add(lens);
  const detailGeometry = new THREE.BoxGeometry(.035, .24, .075);
  for (const y of [.85, .5]) { const button = new THREE.Mesh(detailGeometry, bodyMaterial); button.position.set(-.866, y, 0); phone.add(button); }
  const power = new THREE.Mesh(detailGeometry, bodyMaterial); power.position.set(.866, .7, 0); phone.add(power);
  const speakerGeometry = new THREE.BoxGeometry(.3, .012, .005);
  const speaker = new THREE.Mesh(speakerGeometry, lensMaterial); speaker.position.set(0, 1.664, .094); phone.add(speaker);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x343f40, 3));
  const light = new THREE.DirectionalLight(0xffc6a1, 5); light.position.set(3, 5, 6); scene.add(light);
  return {
    scene, camera,
    update(amount: number, width: number, height: number, opacity = 1) {
      bodyMaterial.opacity = opacity; lensMaterial.opacity = opacity; screenMaterial.uniforms.uOpacity.value = opacity;
      screenMaterial.uniforms.uAspect.value = .492;
      camera.aspect = width / height; camera.updateProjectionMatrix();
      // Begin beyond the viewport, then reveal the surrounding device as the live view shrinks.
      phone.scale.setScalar(THREE.MathUtils.lerp(4.3, height > width ? .88 : 1.05, amount));
      phone.position.x = THREE.MathUtils.lerp(0, height > width ? 0 : 1.55, amount);
      phone.position.y = height > width ? .7 * amount : 0;
      phone.rotation.y = -.17 * amount; phone.rotation.z = -.04 * amount;
    },
    dispose() { geometry.dispose(); screenGeometry.dispose(); lensGeometry.dispose(); detailGeometry.dispose(); speakerGeometry.dispose(); bodyMaterial.dispose(); screenMaterial.dispose(); lensMaterial.dispose(); scene.clear(); },
  };
}
