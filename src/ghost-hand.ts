/**
 * A translucent "ghost" hand that demonstrates a gesture instead of a wall of
 * text: palm-down pouring for watering, open/close for breathing.
 *
 * Local frame: palm faces -Y, fingers point -Z (away from the user once the
 * parent faces them).
 */

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from '@iwsdk/core';

export class GhostHand {
  readonly root = new Group();
  private fingers: Group[] = [];
  private material: MeshBasicMaterial;
  private opacity = 0;
  private targetOpacity = 0;

  constructor() {
    this.material = new MeshBasicMaterial({
      color: 0xe8fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const palm = new Mesh(new SphereGeometry(0.03, 16, 10), this.material);
    palm.scale.set(1.2, 0.35, 1.25);
    this.root.add(palm);

    const fingerGeo = new CylinderGeometry(0.0065, 0.0075, 0.05, 8);
    fingerGeo.rotateX(Math.PI / 2);
    fingerGeo.translate(0, 0, -0.025);
    const xs = [-0.022, -0.0075, 0.0075, 0.022];
    const lengths = [0.8, 1, 0.95, 0.75];
    xs.forEach((x, i) => {
      const pivot = new Group();
      pivot.position.set(x, 0, -0.03);
      const finger = new Mesh(fingerGeo, this.material);
      finger.scale.set(1, 1, lengths[i]);
      pivot.add(finger);
      this.root.add(pivot);
      this.fingers.push(pivot);
    });
    const thumbPivot = new Group();
    thumbPivot.position.set(0.032, 0, 0.0);
    thumbPivot.rotation.y = -0.9;
    const thumb = new Mesh(fingerGeo, this.material);
    thumb.scale.set(1.05, 1.05, 0.7);
    thumbPivot.add(thumb);
    this.root.add(thumbPivot);
    this.fingers.push(thumbPivot);

    this.root.visible = false;
  }

  show(on: boolean): void {
    this.targetOpacity = on ? 0.45 : 0;
  }

  /** 1 = flat open hand, 0 = loose fist. */
  setOpenness(open: number): void {
    const curl = (1 - Math.max(0, Math.min(1, open))) * 1.6;
    for (let i = 0; i < 4; i++) this.fingers[i].rotation.x = -curl;
    this.fingers[4].rotation.x = -curl * 0.5;
  }

  update(dt: number): void {
    this.opacity += (this.targetOpacity - this.opacity) * (1 - Math.exp(-dt * 6));
    this.material.opacity = this.opacity;
    this.root.visible = this.opacity > 0.01;
  }
}
