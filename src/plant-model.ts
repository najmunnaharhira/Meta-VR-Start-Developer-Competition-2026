/**
 * Procedural desk plant. Low-poly on purpose: it sits ~45 cm from the face,
 * so silhouette and motion matter more than triangle count.
 *
 * Origin is the bottom centre of the pot, so it can be dropped straight onto
 * a detected table plane.
 */

import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
} from '@iwsdk/core';
import { GardenDay, INTENTION_COLORS, MAX_STAGE } from './garden-state.js';

export const POT_HEIGHT = 0.075;
export const SOIL_Y = 0.068;
const MAX_LEAVES = 3 + MAX_STAGE * 2;
const MAX_FLOWERS = 12;
const GOLDEN_ANGLE = 2.39996;

interface Leaf {
  pivot: Group;
  mesh: Mesh;
  scale: number;
  target: number;
  baseTilt: number;
}

interface Flower {
  group: Group;
  petalMaterial: MeshStandardMaterial;
  scale: number;
  target: number;
}

export class PlantModel {
  readonly root = new Group();
  /** Everything above the soil; leans, sways and breathes. */
  readonly stemGroup = new Group();

  private stem: Mesh;
  private leaves: Leaf[] = [];
  private flowers: Flower[] = [];
  private stemHeight = 0.05;
  private stemTarget = 0.05;
  private droop = 0;
  private droopTarget = 0;
  private leanQuat = new Quaternion();
  private leanTarget = new Quaternion();
  private tmpAxis = new Vector3();
  private leafMaterial: MeshStandardMaterial;
  /** 0..1 external breathing value (set by the breathe step). */
  breath = 0;
  /** Water sparkle 0..1, decays over time. */
  wetness = 0;

  constructor() {
    this.root.name = 'desk-garden-plant';

    const potMat = new MeshStandardMaterial({ color: 0xc7643f, roughness: 0.85 });
    const rimMat = new MeshStandardMaterial({ color: 0xb2552f, roughness: 0.8 });
    const soilMat = new MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 });
    const stemMat = new MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.7 });
    this.leafMaterial = new MeshStandardMaterial({
      color: 0x5fb04a,
      roughness: 0.55,
      side: DoubleSide,
    });

    const pot = new Mesh(new CylinderGeometry(0.052, 0.04, 0.065, 24), potMat);
    pot.position.y = 0.0325;
    const rim = new Mesh(new CylinderGeometry(0.057, 0.057, 0.014, 24), rimMat);
    rim.position.y = 0.068;
    const soil = new Mesh(new CylinderGeometry(0.05, 0.05, 0.004, 24), soilMat);
    soil.position.y = SOIL_Y + 0.006;
    this.root.add(pot, rim, soil);

    this.stemGroup.position.y = SOIL_Y + 0.006;
    this.root.add(this.stemGroup);

    const stemGeo = new CylinderGeometry(0.0035, 0.005, 1, 8);
    stemGeo.translate(0, 0.5, 0);
    this.stem = new Mesh(stemGeo, stemMat);
    this.stemGroup.add(this.stem);

    const leafGeo = makeLeafGeometry(0.06, 0.026);
    for (let i = 0; i < MAX_LEAVES; i++) {
      const pivot = new Group();
      pivot.rotation.y = i * GOLDEN_ANGLE;
      const mesh = new Mesh(leafGeo, this.leafMaterial);
      mesh.rotation.x = 0.25;
      pivot.add(mesh);
      pivot.scale.setScalar(0.0001);
      this.stemGroup.add(pivot);
      this.leaves.push({ pivot, mesh, scale: 0, target: 0, baseTilt: 0.9 });
    }

    const petalGeo = new IcosahedronGeometry(0.0075, 0);
    const centerGeo = new IcosahedronGeometry(0.005, 1);
    const centerMat = new MeshStandardMaterial({ color: 0xffe28a, roughness: 0.4 });
    for (let i = 0; i < MAX_FLOWERS; i++) {
      const group = new Group();
      const petalMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.45,
        emissive: 0x000000,
      });
      for (let p = 0; p < 5; p++) {
        const petal = new Mesh(petalGeo, petalMaterial);
        const a = (p / 5) * Math.PI * 2;
        petal.position.set(Math.cos(a) * 0.009, 0, Math.sin(a) * 0.009);
        petal.scale.set(1.2, 0.45, 1);
        group.add(petal);
      }
      group.add(new Mesh(centerGeo, centerMat));
      group.scale.setScalar(0.0001);
      group.visible = false;
      // Parent now so whole-tree passes (e.g. depth occlusion) see every material.
      this.root.add(group);
      this.flowers.push({ group, petalMaterial, scale: 0, target: 0 });
    }
  }

  /** Snap or animate to a garden stage; history colours the flowers. */
  setStage(stage: number, history: GardenDay[], instant = false): void {
    const leafCount = Math.min(MAX_LEAVES, 3 + stage * 2);
    this.stemTarget = 0.05 + stage * 0.016;
    if (instant) this.stemHeight = this.stemTarget;

    this.leaves.forEach((leaf, i) => {
      leaf.target = i < leafCount ? 0.75 + 0.25 * Math.min(1, (leafCount - i) / 4) : 0;
      if (instant) leaf.scale = leaf.target;
    });

    // Newest days first, each blooming on an older (lower) leaf tip.
    const recent = history.slice(-MAX_FLOWERS).reverse();
    this.flowers.forEach((flower, i) => {
      const day = recent[i];
      const leafIndex = leafCount - 1 - i * 2;
      if (!day || leafIndex < 0) {
        flower.target = 0;
        return;
      }
      const leaf = this.leaves[leafIndex];
      if (flower.group.parent !== leaf.mesh) {
        leaf.mesh.add(flower.group);
        flower.group.position.set(0, 0.058, 0.004);
      }
      flower.petalMaterial.color.setHex(INTENTION_COLORS[day.intention]);
      flower.petalMaterial.emissive.setHex(INTENTION_COLORS[day.intention]);
      flower.petalMaterial.emissiveIntensity = 0.15;
      flower.group.visible = true;
      flower.target = i === 0 ? 1.25 : 1;
      if (instant) flower.scale = flower.target;
    });
  }

  setDroop(amount: number, instant = false): void {
    this.droopTarget = amount;
    if (instant) this.droop = amount;
  }

  /** Lean the plant toward a direction (plant-local XZ), e.g. a real window. */
  setLean(localDir: Vector3 | null, amount = 0.2): void {
    if (!localDir || localDir.lengthSq() < 1e-6) {
      this.leanTarget.identity();
      return;
    }
    this.tmpAxis.set(localDir.z, 0, -localDir.x).normalize();
    this.leanTarget.setFromAxisAngle(this.tmpAxis, amount);
  }

  get topHeight(): number {
    return this.stemGroup.position.y + this.stemHeight;
  }

  update(dt: number, time: number): void {
    const k = 1 - Math.exp(-dt * 2.5);
    this.stemHeight += (this.stemTarget - this.stemHeight) * k;
    this.droop += (this.droopTarget - this.droop) * (1 - Math.exp(-dt * 1.5));
    this.leanQuat.slerp(this.leanTarget, 1 - Math.exp(-dt));

    this.stem.scale.y = this.stemHeight;

    const sway = Math.sin(time * 0.9) * 0.025;
    this.stemGroup.quaternion.copy(this.leanQuat);
    this.stemGroup.rotateZ(sway);
    const breathe = 1 + this.breath * 0.06;
    this.stemGroup.scale.set(breathe, 1 + this.breath * 0.03, breathe);

    const n = this.leaves.length;
    for (let i = 0; i < n; i++) {
      const leaf = this.leaves[i];
      leaf.scale += (leaf.target - leaf.scale) * k;
      const s = Math.max(0.0001, leaf.scale);
      leaf.pivot.scale.setScalar(s);
      const t = i / Math.max(1, n - 1);
      // Lower leaves sit lower on the stem; everything rides the stem's growth.
      leaf.pivot.position.y = this.stemHeight * (0.12 + 0.85 * Math.min(1, i / (3 + this.stemTarget * 80)));
      const flutter = Math.sin(time * 1.7 + i * 1.3) * 0.04;
      leaf.mesh.rotation.z = -(leaf.baseTilt - t * 0.35 + this.droop * 0.9 + flutter);
    }

    for (const flower of this.flowers) {
      flower.scale += (flower.target - flower.scale) * k;
      flower.group.scale.setScalar(Math.max(0.0001, flower.scale));
      if (flower.target === 0 && flower.scale < 0.01) flower.group.visible = false;
    }

    this.wetness = Math.max(0, this.wetness - dt * 0.2);
    const wetDarken = 1 - this.wetness * 0.15;
    const dry = this.droop * 0.35;
    this.leafMaterial.color.setRGB(
      (0.37 + dry * 0.35) * wetDarken,
      (0.69 - dry * 0.25) * wetDarken,
      (0.29 - dry * 0.1) * wetDarken,
    );
    this.leafMaterial.roughness = 0.55 - this.wetness * 0.35;
  }
}

function makeLeafGeometry(length: number, width: number): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(width * 0.9, length * 0.35, width * 0.1, length);
  s.quadraticCurveTo(0, length * 1.02, -width * 0.1, length);
  s.quadraticCurveTo(-width * 0.9, length * 0.35, 0, 0);
  return new ShapeGeometry(s, 6);
}
