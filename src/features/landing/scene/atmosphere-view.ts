import * as THREE from "three";

/**
 * Uniforms shared by everything drawn in the half-resolution atmosphere pass
 * (ray-marched wall volumes and the flame/smoke/ember sprites). The compositor
 * refreshes them once per pass with the camera and the opaque depth texture.
 */
export function createAtmosphereView() {
  return {
    uDepth: { value: null as THREE.DepthTexture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uInverseProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uJunctionClearance: { value: 1 },
  };
}

export type AtmosphereView = ReturnType<typeof createAtmosphereView>;
