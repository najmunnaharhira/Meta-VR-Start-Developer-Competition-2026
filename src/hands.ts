/**
 * Reads raw WebXR hand joints each frame and turns them into the few signals
 * the ritual needs: palm position, palm facing, openness and pinch.
 *
 * WebXR joint frames: -Y points out of the palm, so the palm normal is the
 * metacarpal's -Y axis. That holds for both hands, no handedness flip needed.
 */

import { Matrix4, Quaternion, Vector3 } from '@iwsdk/core';

export interface HandSignal {
  tracked: boolean;
  /** World-space palm centre (middle-finger metacarpal). */
  palm: Vector3;
  /** World-space unit vector pointing out of the palm. */
  palmNormal: Vector3;
  /** World-space index fingertip. */
  indexTip: Vector3;
  /** 0 = fist, 1 = fully open. */
  openness: number;
  pinching: boolean;
}

const TIP_JOINTS: XRHandJoint[] = [
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];

function makeSignal(): HandSignal {
  return {
    tracked: false,
    palm: new Vector3(),
    palmNormal: new Vector3(0, 1, 0),
    indexTip: new Vector3(),
    openness: 1,
    pinching: false,
  };
}

export class HandTracker {
  readonly left = makeSignal();
  readonly right = makeSignal();

  private wrist = new Vector3();
  private tmp = new Vector3();
  private thumb = new Vector3();
  private quat = new Quaternion();
  private originQuat = new Quaternion();

  /** Call once per frame with the XR frame, reference space and player origin matrix. */
  update(
    frame: XRFrame | null | undefined,
    refSpace: XRReferenceSpace | null | undefined,
    originMatrix: Matrix4,
  ): void {
    this.left.tracked = false;
    this.right.tracked = false;
    if (!frame || !refSpace) return;
    this.originQuat.setFromRotationMatrix(originMatrix);
    for (const source of frame.session.inputSources) {
      if (!source.hand || (source.handedness !== 'left' && source.handedness !== 'right')) {
        continue;
      }
      const out = source.handedness === 'left' ? this.left : this.right;
      this.readHand(frame, refSpace, source.hand, originMatrix, out);
    }
  }

  /** Both hands, allocated once so per-frame loops don't create garbage. */
  readonly any: readonly HandSignal[] = [this.left, this.right];

  private jointPos(
    frame: XRFrame,
    refSpace: XRReferenceSpace,
    hand: XRHand,
    joint: XRHandJoint,
    origin: Matrix4,
    target: Vector3,
  ): XRJointPose | undefined {
    const space = hand.get(joint);
    if (!space || !frame.getJointPose) return undefined;
    const pose = frame.getJointPose(space, refSpace);
    if (!pose) return undefined;
    const p = pose.transform.position;
    target.set(p.x, p.y, p.z).applyMatrix4(origin);
    return pose;
  }

  private readHand(
    frame: XRFrame,
    refSpace: XRReferenceSpace,
    hand: XRHand,
    origin: Matrix4,
    out: HandSignal,
  ): void {
    const wristPose = this.jointPos(frame, refSpace, hand, 'wrist', origin, this.wrist);
    const metaPose = this.jointPos(
      frame,
      refSpace,
      hand,
      'middle-finger-metacarpal',
      origin,
      out.palm,
    );
    if (!wristPose || !metaPose) return;

    const o = metaPose.transform.orientation;
    this.quat.set(o.x, o.y, o.z, o.w).premultiply(this.originQuat);
    out.palmNormal.set(0, -1, 0).applyQuaternion(this.quat).normalize();

    // Openness: fingertip reach relative to palm size, so it works for any hand size.
    const handSize = Math.max(0.03, this.wrist.distanceTo(out.palm));
    let reach = 0;
    let count = 0;
    for (const joint of TIP_JOINTS) {
      if (this.jointPos(frame, refSpace, hand, joint, origin, this.tmp)) {
        reach += this.tmp.distanceTo(this.wrist) / handSize;
        count++;
      }
    }
    if (count > 0) {
      // ~1.3 for a fist, ~2.3 for a flat open hand.
      out.openness = Math.max(0, Math.min(1, (reach / count - 1.4) / 0.8));
    }

    const hasIndex = this.jointPos(frame, refSpace, hand, 'index-finger-tip', origin, out.indexTip);
    const hasThumb = this.jointPos(frame, refSpace, hand, 'thumb-tip', origin, this.thumb);
    if (hasIndex && hasThumb) {
      const d = out.indexTip.distanceTo(this.thumb);
      // Hysteresis so a held pinch doesn't flicker.
      out.pinching = out.pinching ? d < 0.035 : d < 0.02;
    }
    out.tracked = true;
  }
}
