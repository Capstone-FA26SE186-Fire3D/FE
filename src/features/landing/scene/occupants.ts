import * as THREE from "three";
import { stairs } from "./building-layout";
import { roundWalkingPath } from "./walking-path";
import { createOccupantInstances } from "./occupant-instances";
import { createFireEffects } from "./fire-effects";
import type { FireSource } from "./building";
import { sampleReaction, type ReactionKind } from "./occupant-reactions";

/** Authored demonstration paths, not an evacuation solver. Distances drive gait and speed. */
export function createOccupants(mobile: boolean) {
  const group = new THREE.Group(); group.name = "evacuation-demo-occupants";
  const geometry = new THREE.CapsuleGeometry(.085, .3, 3, 6);
  const headGeometry = new THREE.SphereGeometry(.11, 8, 6);
  const torsoGeometry = new THREE.CapsuleGeometry(.16, .32, 3, 8);
  const shinGeometry = new THREE.CapsuleGeometry(.075, .22, 3, 6);
  const shoeGeometry = new THREE.BoxGeometry(.15, .10, .27);
  const forearmGeometry = new THREE.CapsuleGeometry(.055, .19, 3, 8);
  const neckGeometry = new THREE.CylinderGeometry(.065, .075, .12, 8);
  const skin = new THREE.MeshStandardMaterial({ color: 0xb88c70, roughness: .9 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x23313c, roughness: .85 });
  const shirts = [0x738d9b, 0xac6c49, 0x829079, 0xc9b79a].map(color => new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  function person(index: number) {
    const root = new THREE.Group(); group.add(root);
    const upperBody = new THREE.Group(); upperBody.name = "upper-body"; upperBody.position.y = .73; root.add(upperBody);
    const torso = new THREE.Mesh(torsoGeometry, shirts[index % shirts.length]); torso.position.y = .32; upperBody.add(torso);
    const neck = new THREE.Mesh(neckGeometry, skin); neck.position.y = .675; upperBody.add(neck);
    const head = new THREE.Mesh(headGeometry, skin); head.scale.set(1,1.15,.95); head.position.y = .82; upperBody.add(head);
    const limbs = [-1, 1].map(side => {
      const leg = new THREE.Group(); leg.position.set(side * .105, .73, 0); root.add(leg);
      const legMesh = new THREE.Mesh(geometry, trousers); legMesh.position.y = -.19; leg.add(legMesh);
      const knee = new THREE.Group(); knee.name = "knee-joint"; knee.position.y = -.36; leg.add(knee);
      const shin = new THREE.Mesh(shinGeometry, trousers); shin.position.y = -.16; knee.add(shin);
      const shoe = new THREE.Mesh(shoeGeometry, trousers); shoe.name = "shoe"; shoe.position.set(0, -.32, .06); knee.add(shoe);
      const arm = new THREE.Group(); arm.position.set(side * .23, .52, 0); upperBody.add(arm);
      const armMesh = new THREE.Mesh(geometry, shirts[index % shirts.length]); armMesh.scale.set(.8,.65,.8); armMesh.position.y = -.14; arm.add(armMesh);
      const elbow = new THREE.Group(); elbow.name = "elbow-joint"; elbow.position.y = -.27; elbow.rotation.x = -1.1; arm.add(elbow);
      const forearm = new THREE.Mesh(forearmGeometry, skin); forearm.position.y = -.12; elbow.add(forearm);
      return { arm, leg, knee, elbow, shoe, side };
    });
    root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    return { root, limbs, upperBody };
  }
  const agents = Array.from({ length: mobile ? 12 : 24 }, (_, index) => {
    const actor = person(index);
    const side = index % 2 ? 1 : -1, room = [5, -1, -7][Math.floor(index / 3) % 3];
    const lane = side * (.72 + (index % 3) * .08);
    const level = index % 3, elevation = level * 3.6;
    // Start behind the desk rather than inside it, then cross the open doorway
    // away from its hinge. Keep the corridor turn clear of the door jamb.
    const waypoints = [
      new THREE.Vector3(side * 3.2, elevation, room + 1.4),
      new THREE.Vector3(side * 2.1, elevation, room + 1.1),
      new THREE.Vector3(side * 2.1, elevation, room + .3),
      new THREE.Vector3(lane, elevation, room + .3),
    ];
    const crossCorridor = (targetZ: number, y: number) => {
      const startZ = waypoints.at(-1)!.z;
      const count = Math.max(1, Math.ceil(Math.abs(targetZ - startZ) / 3));
      for (let step = 1; step < count; step++) {
        const z = THREE.MathUtils.lerp(startZ, targetZ, step / count);
        // Different phases produce diagonal crossings and gentle bends rather
        // than two fixed lanes. Stay inside the clear central corridor.
        const x = Math.sin(index * 2.399 + step * 1.3 + y) * .82;
        waypoints.push(new THREE.Vector3(x, y, z));
      }
      waypoints.push(new THREE.Vector3(Math.sin(index * 1.7) * .64, y, targetZ));
    };
    // Cross the rear landing, descend the same staircase geometry, then take the ground exit.
    for (let floor = level; floor > 0; floor--) {
      const y = floor * 3.6;
      crossCorridor(stairs.landingZ, y);
      waypoints.push(new THREE.Vector3(stairs.x, y, stairs.landingZ));
      for (let tread = stairs.count - 1; tread >= 0; tread--) waypoints.push(new THREE.Vector3(stairs.x, y - 3.6 + (tread + 1) * stairs.rise, stairs.bottomZ - tread * stairs.run));
      waypoints.push(new THREE.Vector3(stairs.x, y - 3.6, stairs.exitZ), new THREE.Vector3(lane, y - 3.6, stairs.exitZ));
    }
    crossCorridor(10, 0);
    const escapeAngle = (index * 2.399) % Math.PI;
    // Continue across the plaza; never park a running actor at the exit.
    waypoints.push(new THREE.Vector3(Math.cos(escapeAngle) * 2.8, 0, 11 + Math.sin(escapeAngle) * 1.6));
    waypoints.push(new THREE.Vector3(Math.cos(escapeAngle) * 8, 0, 19 + Math.sin(escapeAngle) * 3));
    waypoints.push(new THREE.Vector3(Math.cos(escapeAngle) * 15, 0, 32 + Math.sin(escapeAngle) * 4));
    const points = roundWalkingPath(waypoints);
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]));
    const reaction: ReactionKind = [1, 4, 7].includes(index) ? "panic" : [2, 5, 8].includes(index) ? "cough" : null;
    const speed = 1.6 + (index % 4) * .18;
    // React after clearing the doorway, while still on the level corridor floor.
    const corridorPoint = points.findIndex(p => Math.abs(p.x) < .65);
    return { ...actor, points, distances, speed, reaction,
      reactionStart: distances[Math.max(0, corridorPoint)] / speed,
      delay: Math.floor(index / 3) * 1.7 };
  });
  const player = person(0); player.root.name = "demo-controlled-character";
  const instances = createOccupantInstances(group);
  // A small in-world marker makes the controlled avatar legible inside the
  // phone render without turning the preview into a fake UI screenshot.
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x68e0cf, transparent: true, opacity: .84, side: THREE.DoubleSide, depthWrite: false });
  const marker = new THREE.Mesh(new THREE.RingGeometry(.14, .18, 24), markerMaterial);
  marker.rotation.x = -Math.PI / 2; marker.position.y = .018; marker.name = "controlled-character-marker"; player.root.add(marker);
  const markerArrowGeometry = new THREE.ConeGeometry(.06, .12, 3);
  const markerArrow = new THREE.Mesh(markerArrowGeometry, markerMaterial);
  markerArrow.position.y = 1.55; markerArrow.name = "controlled-character-arrow"; player.root.add(markerArrow);
  const panicAgents = agents.filter(agent => agent.reaction === "panic");
  const clothingSources: FireSource[] = panicAgents.map(() => ({
    position: new THREE.Vector3(), color: new THREE.Color(0xff802c),
    intensity: 0, activity: 0, size: [.28, .38],
  }));
  const clothingFire = createFireEffects(clothingSources, mobile);
  clothingFire.group.name = "non-graphic-clothing-flames";
  const direction = new THREE.Vector3();
  const footPosition = new THREE.Vector3();
  function animateRun(actor: ReturnType<typeof person>, gait: number, stride: number) {
    actor.upperBody.rotation.set(0, 0, 0);
    for (const limb of actor.limbs) {
      limb.arm.rotation.z = 0;
      const swing = Math.sin(gait) * limb.side;
      limb.leg.rotation.x = swing * stride;
      limb.knee.rotation.x = .12 + Math.max(0, -swing) * .85;
      limb.arm.rotation.x = -swing * .48 - .12;
      limb.elbow.rotation.x = -1.15 + swing * .15;
    }
    // Keep the lowest shoe above the route's supporting surface through the gait.
    const surface = actor.root.position.y;
    actor.root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const limb of actor.limbs) {
      limb.shoe.getWorldPosition(footPosition);
      const angle = limb.leg.rotation.x + limb.knee.rotation.x;
      const extent = .05 * Math.abs(Math.cos(angle)) + .135 * Math.abs(Math.sin(angle));
      lowest = Math.min(lowest, footPosition.y - extent);
    }
    actor.root.position.y += Math.max(0, surface - lowest);
  }
  return {
    group, renderGroup: instances.group, effectsGroup: clothingFire.group, player: player.root,
    update(time: number, showPlayer: boolean) {
      for (const agent of agents) {
        const length = agent.distances.at(-1)!;
        const elapsed = time - agent.delay;
        const routeDuration = length / agent.speed;
        const cycle = routeDuration + 8 + (agent.reaction ? 6 : 0);
        const cycleTime = Math.max(0, elapsed) % cycle;
        const reaction = sampleReaction(cycleTime, agent.reactionStart, agent.reaction);
        const distance = reaction.travelTime * agent.speed;
        agent.root.userData.reaction = reaction.weight > .01 ? agent.reaction : "walking";
        agent.root.userData.reactionWeight = reaction.weight;
        agent.root.visible = elapsed >= 0 && distance < length;
        if (!agent.root.visible) continue;
        const segment = agent.distances.findIndex((d, i) => i > 0 && d >= distance);
        const previous = segment - 1;
        const fraction = (distance - agent.distances[previous]) / (agent.distances[segment] - agent.distances[previous]);
        agent.root.position.lerpVectors(agent.points[previous], agent.points[segment], fraction);
        // Anticipate the next turn before reaching the corner; never wait for
        // the actor to touch a wall before snapping its heading by 90 degrees.
        const ahead = Math.min(length, distance + .45);
        const aheadSegment = agent.distances.findIndex((d, i) => i > 0 && d >= ahead);
        const aheadFraction = (ahead - agent.distances[aheadSegment - 1]) / (agent.distances[aheadSegment] - agent.distances[aheadSegment - 1]);
        direction.lerpVectors(agent.points[aheadSegment - 1], agent.points[aheadSegment], aheadFraction).sub(agent.root.position);
        agent.root.rotation.y = Math.atan2(direction.x, direction.z);
        const gait = time * agent.speed * 7 + agent.delay;
        agent.root.position.y += Math.abs(Math.sin(gait)) * .045 * (1 - reaction.weight);
        animateRun(agent, gait, .65 * (1 - reaction.weight) + (agent.reaction === "panic" ? .24 * reaction.weight : 0));
        const weight = reaction.weight;
        if (agent.reaction === "cough") {
          agent.upperBody.rotation.x = weight * (.48 + .06 * Math.sin(time * 11));
          for (const limb of agent.limbs) {
            limb.arm.rotation.x = THREE.MathUtils.lerp(limb.arm.rotation.x, limb.side < 0 ? -1 : -.25, weight);
            limb.elbow.rotation.x = THREE.MathUtils.lerp(limb.elbow.rotation.x, limb.side < 0 ? -2.1 : -.5, weight);
          }
        } else if (agent.reaction === "panic") {
          agent.upperBody.rotation.z = Math.sin(time * 5 + agent.delay) * .09 * weight;
          for (const limb of agent.limbs) {
            limb.arm.rotation.x = THREE.MathUtils.lerp(limb.arm.rotation.x, -.8 + Math.sin(time * 8 + limb.side * 2 + agent.delay) * .7, weight);
            limb.arm.rotation.z = -limb.side * (.5 + .18 * Math.sin(time * 7 + limb.side)) * weight;
            limb.elbow.rotation.x = THREE.MathUtils.lerp(limb.elbow.rotation.x, -1.4 + .4 * Math.sin(time * 9 + limb.side), weight);
          }
        }
      }
      player.root.visible = showPlayer;
      // A narrow loop fits the corridor; its tangent turns continuously at both
      // ends instead of flipping the character by 180 degrees in one frame.
      const phase = time * .2;
      player.root.position.set(.4 * Math.cos(phase), .025 * Math.abs(Math.sin(time * 9)), -3 + 4 * Math.sin(phase));
      player.root.rotation.y = Math.atan2(-.4 * Math.sin(phase), 4 * Math.cos(phase));
      animateRun(player, time * 9, .45);
      panicAgents.forEach((agent, index) => {
        const source = clothingSources[index];
        source.activity = agent.root.visible ? agent.root.userData.reactionWeight : 0;
        source.position.copy(agent.root.position); source.position.y += .65;
      });
      clothingFire.update(time);
      instances.update();
    },
    dispose() { clothingFire.dispose(); instances.dispose(); geometry.dispose(); headGeometry.dispose(); torsoGeometry.dispose(); shinGeometry.dispose(); shoeGeometry.dispose(); forearmGeometry.dispose(); neckGeometry.dispose(); marker.geometry.dispose(); markerArrowGeometry.dispose(); markerMaterial.dispose(); skin.dispose(); trousers.dispose(); shirts.forEach(m => m.dispose()); group.clear(); },
  };
}
