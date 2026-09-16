import * as THREE from "three";

/** Local corner rounding stays within the authored clearance corridor. */
export function roundWalkingPath(waypoints: THREE.Vector3[]) {
  const points = [waypoints[0].clone()];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const previous = waypoints[i - 1], corner = waypoints[i], next = waypoints[i + 1];
    // Stairs retain their exact tread elevations and center line.
    if (Math.abs(previous.y - corner.y) > .01 || Math.abs(next.y - corner.y) > .01) {
      points.push(corner.clone()); continue;
    }
    const radius = Math.min(corner.z > 11 ? 1.2 : .2, previous.distanceTo(corner) * .25, next.distanceTo(corner) * .25);
    const entry = previous.clone().sub(corner).setLength(radius).add(corner);
    const exit = next.clone().sub(corner).setLength(radius).add(corner);
    points.push(entry);
    const curve = new THREE.QuadraticBezierCurve3(entry, corner, exit);
    for (let sample = 1; sample <= 6; sample++) points.push(curve.getPoint(sample / 6));
  }
  points.push(waypoints.at(-1)!.clone());
  return points;
}
