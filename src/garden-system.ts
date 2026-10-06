/**
 * Desk Garden: a daily two-minute ritual with a plant that lives on your real
 * desk. Plant an intention, water it with your palm, breathe with it, and it
 * grows one stage per day.
 *
 * Flow: placing -> greet -> intention -> water -> breathe -> bloom -> rest.
 * Every hand gesture also has a "Help me" ray/poke/click alternative, and the
 * breathing step completes for anyone who simply watches and breathes.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  createSystem,
  Entity,
  Group,
  Hovered,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PokeInteractable,
  Pressed,
  Quaternion,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import { GardenButton } from './garden-components.js';
import {
  completeRitual,
  doneToday,
  droopAmount,
  GardenSave,
  Intention,
  INTENTION_COLORS,
  INTENTION_LABELS,
  INTENTIONS,
  loadSave,
  writeSave,
} from './garden-state.js';
import { HandTracker } from './hands.js';
import { HIGH_CONTRAST_STYLE, NORMAL_STYLE, TextCard } from './label.js';
import { PlantModel, POT_HEIGHT, SOIL_Y } from './plant-model.js';
import { sfx, unlockAudio } from './sfx.js';

type Phase = 'placing' | 'greet' | 'intention' | 'water' | 'breathe' | 'bloom' | 'rest';

interface Button {
  entity: Entity;
  card: TextCard;
  shown: boolean;
}

const WATER_SECONDS = 3;
const BREATH_HALF = 3.2; // seconds per inhale / exhale
const BREATH_CYCLES = 3;
const PLACE_SEARCH_SECONDS = 3;
const DROP_COUNT = 28;

export class GardenSystem extends createSystem({
  pressed: { required: [GardenButton, Pressed] },
  planes: { required: [XRPlane] },
}) {
  private save!: GardenSave;
  private phase: Phase = 'placing';
  private phaseTime = 0;
  private immersive = false;

  private gardenEntity!: Entity;
  private garden!: Group;
  private ui!: Group;
  private uiEntity!: Entity;
  private plant!: PlantModel;
  private prompt!: TextCard;
  private buttons = new Map<string, Button>();

  private hands = new HandTracker();
  private chosen: Intention = 'focus';
  private waterProgress = 0;
  private helpPouring = false;
  private breathCycle = 0;
  private dropTimer = 0;
  private grabbingHand: 'left' | 'right' | null = null;
  private grabOffset = new Vector3();
  private userMoved = false;
  private placedOnPlane = false;
  private surfaceName = '';

  private waterTarget!: Mesh;
  private breathRing!: Mesh;
  private sparkle!: Mesh;
  private previewDesk!: Mesh;
  private previewBackground = new Color(0xe7eee4);
  private drops: { mesh: Mesh; vel: Vector3; alive: boolean }[] = [];

  // Scratch objects; never allocate in update().
  private head = new Vector3();
  private v1 = new Vector3();
  private v2 = new Vector3();
  private q1 = new Quaternion();
  private originMatrix = new Matrix4();

  init(): void {
    this.save = loadSave();

    this.garden = new Group();
    this.garden.name = 'desk-garden';
    this.gardenEntity = this.world.createTransformEntity(this.garden);

    this.plant = new PlantModel();
    this.plant.setStage(this.save.stage, this.save.history, true);
    this.plant.setDroop(droopAmount(this.save), true);
    this.garden.add(this.plant.root);

    this.ui = new Group();
    this.uiEntity = this.world.createTransformEntity(this.ui, { parent: this.gardenEntity });

    this.prompt = new TextCard(0.2, 0.1);
    this.prompt.mesh.position.set(0.17, 0.2, 0);
    this.ui.add(this.prompt.mesh);

    this.makeButton('help', 'Help me', 0.17 - 0.068, 0.125, 0.062);
    this.makeButton('contrast', 'Contrast', 0.17, 0.125, 0.062);
    this.makeButton('nextday', 'Next day', 0.17 + 0.068, 0.125, 0.062);
    // Intention chips stack on the left, mirroring the prompt card on the right.
    INTENTIONS.forEach((intent, i) => {
      this.makeButton(`intent:${intent}`, INTENTION_LABELS[intent], -0.15, 0.225 - i * 0.04, 0.075, 0.032);
    });

    // Flat-screen preview only: a stand-in desk and soft backdrop. In the headset
    // the real desk and room show through passthrough instead.
    this.previewDesk = new Mesh(
      new BoxGeometry(0.9, 0.02, 0.5),
      new MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.8 }),
    );
    this.previewDesk.position.set(0, -0.01, 0.05);
    this.garden.add(this.previewDesk);

    this.buildEffects();
    this.applyStyle();

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const nowImmersive = state !== VisibilityState.NonImmersive;
        const entering = nowImmersive && !this.immersive;
        this.immersive = nowImmersive;
        if (entering) {
          unlockAudio();
          this.startPlacing();
        }
      }),
    );

    this.queries.pressed.subscribe('qualify', (entity) => {
      unlockAudio();
      this.onAction(entity.getValue(GardenButton, 'action') as string);
    });

    this.startPlacing();
  }

  // ---------------------------------------------------------------- setup

  private makeButton(
    action: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h = 0.026,
  ): void {
    const card = new TextCard(w, h);
    card.set(label);
    card.mesh.position.set(x, y, action.startsWith('intent:') ? 0.03 : 0);
    const entity = this.world.createTransformEntity(card.mesh, { parent: this.uiEntity });
    entity.addComponent(GardenButton, { action });
    // Start as shown so the first hide actually takes effect.
    const button: Button = { entity, card, shown: true };
    entity.addComponent(RayInteractable);
    entity.addComponent(PokeInteractable);
    this.buttons.set(action, button);
    this.setButtonShown(button, false);

  }

  private setButtonShown(button: Button, shown: boolean): void {
    if (button.shown === shown) return;
    button.shown = shown;
    button.card.mesh.visible = shown;
    if (shown) {
      button.entity.addComponent(RayInteractable);
      button.entity.addComponent(PokeInteractable);
    } else {
      if (button.entity.hasComponent(RayInteractable)) button.entity.removeComponent(RayInteractable);
      if (button.entity.hasComponent(PokeInteractable)) button.entity.removeComponent(PokeInteractable);
    }
  }

  private showButtons(actions: string[]): void {
    for (const [action, button] of this.buttons) {
      this.setButtonShown(button, actions.includes(action));
    }
  }

  private buildEffects(): void {
    this.waterTarget = new Mesh(
      new RingGeometry(0.035, 0.045, 40),
      new MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.waterTarget.rotation.x = -Math.PI / 2;
    this.waterTarget.visible = false;
    this.garden.add(this.waterTarget);

    this.breathRing = new Mesh(
      new TorusGeometry(0.08, 0.0025, 8, 64),
      new MeshBasicMaterial({ color: 0xd8f5c8, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.breathRing.rotation.x = -Math.PI / 2;
    this.breathRing.position.y = SOIL_Y;
    this.breathRing.visible = false;
    this.garden.add(this.breathRing);

    this.sparkle = new Mesh(
      new SphereGeometry(0.12, 24, 16),
      new MeshBasicMaterial({
        color: 0xfff3b0,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.sparkle.visible = false;
    this.garden.add(this.sparkle);

    const dropGeo = new SphereGeometry(0.0035, 8, 6);
    const dropMat = new MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < DROP_COUNT; i++) {
      const mesh = new Mesh(dropGeo, dropMat);
      mesh.scale.set(1, 1.6, 1);
      mesh.visible = false;
      this.garden.add(mesh);
      this.drops.push({ mesh, vel: new Vector3(), alive: false });
    }
  }

  private applyStyle(): void {
    const style = this.save.highContrast ? HIGH_CONTRAST_STYLE : NORMAL_STYLE;
    this.prompt.style = style;
    this.prompt.redraw();
    for (const [action, button] of this.buttons) {
      if (action.startsWith('intent:')) {
        // Chips wear their flower colour so the choice reads before the text does.
        const hex = `#${INTENTION_COLORS[action.slice(7) as Intention].toString(16).padStart(6, '0')}`;
        button.card.style = this.save.highContrast
          ? { ...style, border: hex }
          : { ...style, background: hex, foreground: '#10140f', accent: '#ffffff' };
      } else {
        button.card.style = style;
      }
      button.card.redraw();
    }
  }

  // ---------------------------------------------------------------- flow

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.waterTarget.visible = phase === 'water';
    this.breathRing.visible = phase === 'breathe';
    switch (phase) {
      case 'placing':
        this.prompt.set('Looking for your desk…', 'Sit comfortably and look at your table.');
        this.showButtons([]);
        break;
      case 'greet':
        this.plant.setDroop(droopAmount(this.save));
        this.showButtons(['contrast']);
        if (this.save.history.length === 0) {
          this.prompt.set('Hi, I’m your desk plant', 'One small ritual a day helps me grow.');
        } else if (this.plant && droopAmount(this.save) > 0) {
          this.prompt.set('I missed you!', 'I’m a little thirsty. Shall we?');
        } else {
          this.prompt.set(`Day ${this.save.history.length + 1}`, 'Welcome back. Let’s grow.');
        }
        break;
      case 'intention':
        this.prompt.set('Plant an intention', 'Touch one with your finger, or point and pinch.');
        this.showButtons(['help', 'contrast', 'intent:focus', 'intent:calm', 'intent:move', 'intent:connect']);
        break;
      case 'water':
        this.waterProgress = 0;
        this.helpPouring = false;
        this.prompt.set('Water it', 'Hold your palm face-down over the ring.', 0);
        this.showButtons(['help', 'contrast']);
        break;
      case 'breathe':
        this.breathCycle = 0;
        this.prompt.set('Breathe together', 'Open your hand as the ring grows.');
        this.showButtons(['contrast']);
        break;
      case 'bloom': {
        this.save = completeRitual(this.save, this.chosen);
        writeSave(this.save);
        this.plant.setStage(this.save.stage, this.save.history);
        this.plant.setDroop(0);
        this.sparkle.visible = true;
        sfx.bloom();
        this.prompt.set('It grew!', `${INTENTION_LABELS[this.chosen]} bloomed today.`);
        this.showButtons(['contrast']);
        break;
      }
      case 'rest':
        this.showRest();
        break;
    }
  }

  private showRest(): void {
    const s = this.save;
    const flowers = s.history.length;
    const streak = s.streak > 1 ? `${s.streak}-day streak · ` : '';
    this.prompt.set(
      'See you tomorrow',
      `${streak}${flowers} flower${flowers === 1 ? '' : 's'}. Come back to grow.`,
    );
    this.showButtons(['contrast', 'nextday']);
  }

  private startPlacing(): void {
    this.placedOnPlane = false;
    this.userMoved = false;
    this.placeInFrontOfHead();
    this.setPhase('placing');
  }

  private afterPlaced(): void {
    if (doneToday(this.save)) {
      this.setPhase('rest');
    } else {
      this.setPhase('greet');
    }
  }

  private onAction(action: string): void {
    sfx.tap();
    if (action === 'contrast') {
      this.save = { ...this.save, highContrast: !this.save.highContrast };
      writeSave(this.save);
      this.applyStyle();
      return;
    }
    if (action === 'nextday') {
      // Demo helper so judges can see day-over-day growth in one sitting.
      this.save = { ...this.save, dayOffset: this.save.dayOffset + 1 };
      writeSave(this.save);
      this.setPhase('greet');
      return;
    }
    if (action.startsWith('intent:') && this.phase === 'intention') {
      this.chooseIntention(action.slice(7) as Intention);
      return;
    }
    if (action === 'help') {
      if (this.phase === 'intention') this.chooseIntention('calm');
      else if (this.phase === 'water') this.helpPouring = true;
    }
  }

  private chooseIntention(intent: Intention): void {
    this.chosen = intent;
    sfx.seed();
    this.setPhase('water');
  }

  // ---------------------------------------------------------------- placement

  private readHead(): void {
    this.camera.getWorldPosition(this.head);
  }

  private placeInFrontOfHead(): void {
    this.readHead();
    this.camera.getWorldDirection(this.v1);
    this.v1.y = 0;
    if (this.v1.lengthSq() < 1e-4) this.v1.set(0, 0, -1);
    this.v1.normalize();
    // In the headset: a seated desk spot. On a flat screen: further out so it fits the view.
    const reach = this.immersive ? 0.42 : 0.55;
    const drop = this.immersive ? 0.38 : 0.2;
    this.garden.position.set(
      this.head.x + this.v1.x * reach,
      this.head.y - drop,
      this.head.z + this.v1.z * reach,
    );
    this.surfaceName = '';
  }

  /** Pick the horizontal plane that best matches a seated desk in front of the user. */
  private tryPlaceOnPlane(): boolean {
    this.readHead();
    this.camera.getWorldDirection(this.v1);
    this.v1.y = 0;
    if (this.v1.lengthSq() < 1e-4) this.v1.set(0, 0, -1);
    this.v1.normalize();
    const idealX = this.head.x + this.v1.x * 0.42;
    const idealZ = this.head.z + this.v1.z * 0.42;

    let best: Entity | null = null;
    let bestScore = Infinity;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as XRPlane | undefined;
      const obj = entity.object3D;
      if (!plane || !obj || plane.orientation !== 'horizontal') continue;
      obj.getWorldPosition(this.v2);
      const drop = this.head.y - this.v2.y;
      if (drop < 0.15 || drop > 0.9) continue; // not a desk for a seated person
      const label = (plane.semanticLabel ?? '').toLowerCase();
      const dist = Math.hypot(this.v2.x - idealX, this.v2.z - idealZ);
      const score = dist - (label === 'table' || label === 'desk' ? 0.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = entity;
      }
    }
    if (!best || !best.object3D) return false;

    const plane = best.getValue(XRPlane, '_plane') as XRPlane;
    const obj = best.object3D;
    obj.updateWorldMatrix(true, false);
    // Clamp the ideal spot to the plane's polygon bounds (plane-local XZ), inset by the pot radius.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of plane.polygon) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    this.v2.set(idealX, 0, idealZ);
    obj.worldToLocal(this.v2);
    const inset = 0.07;
    this.v2.x = clampInset(this.v2.x, minX, maxX, inset);
    this.v2.z = clampInset(this.v2.z, minZ, maxZ, inset);
    this.v2.y = 0;
    obj.localToWorld(this.v2);
    this.garden.position.copy(this.v2);
    this.placedOnPlane = true;
    const label = (plane.semanticLabel ?? '').toLowerCase();
    this.surfaceName = label === 'table' || label === 'desk' ? 'desk' : 'table';
    return true;
  }

  /** Lean toward the nearest real window, if the room scan has one. */
  private updateLean(): void {
    let found = false;
    let bestD = Infinity;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as XRPlane | undefined;
      const label = (plane?.semanticLabel ?? '').toLowerCase();
      if (!entity.object3D || (label !== 'window' && label !== 'window_frame')) continue;
      entity.object3D.getWorldPosition(this.v2);
      const d = this.v2.distanceTo(this.garden.position);
      if (d < bestD) {
        bestD = d;
        this.v1.copy(this.v2);
        found = true;
      }
    }
    if (!found) {
      this.plant.setLean(null);
      return;
    }
    this.v1.sub(this.garden.position);
    this.v1.y = 0;
    this.q1.copy(this.garden.quaternion).invert();
    this.v1.applyQuaternion(this.q1).normalize();
    this.plant.setLean(this.v1, 0.22);
  }

  // ---------------------------------------------------------------- frame

  update(delta: number, time: number): void {
    // Pause the ritual while system UI covers the session; resume where we left off.
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) return;
    const dt = Math.min(delta, 0.1);
    this.phaseTime += dt;
    this.readHead();

    if (this.immersive) {
      this.player.updateWorldMatrix(true, false);
      this.originMatrix.copy(this.player.matrixWorld);
      this.hands.update(
        this.xrManager.getFrame(),
        this.xrManager.getReferenceSpace(),
        this.originMatrix,
      );
    } else {
      this.hands.left.tracked = false;
      this.hands.right.tracked = false;
    }

    // UI faces the user so text stays readable from a seated pose.
    // lookAt() takes a world-space target; yaw only, so the cards stay upright.
    this.ui.position.set(0, Math.max(0, this.plant.topHeight - 0.2), 0);
    this.garden.updateWorldMatrix(true, false);
    this.ui.updateWorldMatrix(false, false);
    this.ui.getWorldPosition(this.v1);
    this.ui.lookAt(this.head.x, this.v1.y, this.head.z);

    this.previewDesk.visible = !this.immersive;
    this.scene.background = this.immersive ? null : this.previewBackground;
    if (!this.immersive) {
      // Flat-screen preview: frame the plant and its cards.
      this.camera.lookAt(this.garden.position.x + 0.06, this.garden.position.y + 0.14, this.garden.position.z);
    }

    this.updateHover();
    this.updateGrab();
    this.updateDrops(dt);

    switch (this.phase) {
      case 'placing':
        if (!this.immersive || this.tryPlaceOnPlane() || this.phaseTime > PLACE_SEARCH_SECONDS) {
          if (this.immersive && this.placedOnPlane) {
            this.prompt.set(`Found your ${this.surfaceName}`, '');
          }
          this.afterPlaced();
        }
        break;
      case 'greet':
        // Late-arriving room planes: hop onto the desk once, unless the user moved the pot.
        if (this.immersive && !this.placedOnPlane && !this.userMoved) this.tryPlaceOnPlane();
        if (this.phaseTime > 3.2) this.setPhase('intention');
        break;
      case 'intention':
        break;
      case 'water':
        this.updateWater(dt);
        break;
      case 'breathe':
        this.updateBreathe();
        break;
      case 'bloom': {
        const t = this.phaseTime;
        this.sparkle.position.y = this.plant.topHeight * 0.7;
        (this.sparkle.material as MeshBasicMaterial).opacity = Math.max(0, 0.35 * (1 - t / 2.5));
        this.sparkle.scale.setScalar(0.4 + t * 0.6);
        if (t > 4.5) {
          this.sparkle.visible = false;
          this.setPhase('rest');
        }
        break;
      }
      case 'rest':
        this.plant.breath = 0;
        break;
    }

    if (this.phaseTime < dt * 2 || Math.floor(time) !== Math.floor(time - dt)) this.updateLean();
    this.plant.update(dt, time);
  }

  private updateHover(): void {
    for (const button of this.buttons.values()) {
      const hovered = button.shown && button.entity.hasComponent(Hovered);
      if (hovered !== button.card.highlighted) {
        button.card.highlighted = hovered;
        button.card.redraw();
      }
    }
  }

  /** Pinch the pot to slide the garden along the desk. */
  private updateGrab(): void {
    for (const side of ['left', 'right'] as const) {
      const hand = this.hands[side];
      if (this.grabbingHand === side) {
        if (!hand.tracked || !hand.pinching) {
          this.grabbingHand = null;
          continue;
        }
        this.garden.position.x = hand.indexTip.x + this.grabOffset.x;
        this.garden.position.z = hand.indexTip.z + this.grabOffset.z;
        continue;
      }
      if (this.grabbingHand || !hand.tracked || !hand.pinching) continue;
      this.v2.copy(hand.indexTip);
      this.garden.worldToLocal(this.v2);
      const nearPot = Math.hypot(this.v2.x, this.v2.z) < 0.075 && this.v2.y > -0.02 && this.v2.y < POT_HEIGHT + 0.02;
      if (nearPot && this.phase !== 'water') {
        this.grabbingHand = side;
        this.userMoved = true;
        this.grabOffset.set(
          this.garden.position.x - hand.indexTip.x,
          0,
          this.garden.position.z - hand.indexTip.z,
        );
      }
    }
  }

  private updateWater(dt: number): void {
    const top = this.plant.topHeight;
    this.waterTarget.position.y = top + 0.1;
    const pulse = 1 + Math.sin(this.phaseTime * 4) * 0.08;
    this.waterTarget.scale.setScalar(pulse);

    let pouring = false;
    for (const hand of this.hands.any) {
      if (!hand.tracked) continue;
      this.v2.copy(hand.palm);
      this.garden.worldToLocal(this.v2);
      const over = Math.hypot(this.v2.x, this.v2.z) < 0.15 && this.v2.y > top - 0.03 && this.v2.y < top + 0.35;
      if (over && hand.palmNormal.y < -0.5) {
        pouring = true;
        this.spawnDrops(dt, this.v2);
      }
    }
    // "Help me" pours on the user's behalf.
    if (!pouring && this.helpPouring) {
      pouring = true;
      this.v2.set(0, top + 0.1, 0);
      this.spawnDrops(dt, this.v2);
    }
    if (pouring) {
      this.waterProgress += dt / WATER_SECONDS;
      this.plant.wetness = Math.min(1, this.plant.wetness + dt);
      this.plant.setDroop(droopAmount(this.save) * (1 - this.waterProgress));
    }
    this.prompt.set(
      pouring ? 'Lovely…' : 'Water it',
      pouring ? 'Keep pouring.' : 'Hold your palm face-down over the ring.',
      Math.min(1, this.waterProgress),
    );
    if (this.waterProgress >= 1) {
      sfx.stepDone();
      this.setPhase('breathe');
    }
  }

  private updateBreathe(): void {
    const cycleLen = BREATH_HALF * 2;
    const t = this.phaseTime;
    const cycle = Math.floor(t / cycleLen);
    const inCycle = t - cycle * cycleLen;
    const inhaling = inCycle < BREATH_HALF;
    const guide = inhaling
      ? easeInOut(inCycle / BREATH_HALF)
      : 1 - easeInOut((inCycle - BREATH_HALF) / BREATH_HALF);

    if (cycle !== this.breathCycle || this.phaseTime < 0.05) {
      this.breathCycle = cycle;
      if (cycle < BREATH_CYCLES) sfx.breath(true);
    }
    if (Math.abs(inCycle - BREATH_HALF) < 0.02) sfx.breath(false);

    // The plant mirrors your hand if we can see it, otherwise it follows the guide.
    let handOpen = -1;
    for (const hand of this.hands.any) {
      if (hand.tracked) handOpen = Math.max(handOpen, hand.openness);
    }
    this.plant.breath = handOpen >= 0 ? handOpen : guide;
    const ringScale = 0.7 + guide * 0.7;
    this.breathRing.scale.setScalar(ringScale);
    const inSync = handOpen >= 0 && Math.abs(handOpen - guide) < 0.3;
    (this.breathRing.material as MeshBasicMaterial).color.set(inSync ? 0x9be37a : 0xd8f5c8);

    this.prompt.set(
      inhaling ? 'Breathe in…' : 'Breathe out…',
      inhaling ? 'Slowly open your hand.' : 'Gently close it.',
      Math.min(1, t / (cycleLen * BREATH_CYCLES)),
    );
    if (cycle >= BREATH_CYCLES) {
      this.plant.breath = 0;
      this.setPhase('bloom');
    }
  }

  private spawnDrops(dt: number, localPos: Vector3): void {
    this.dropTimer -= dt;
    if (this.dropTimer > 0) return;
    this.dropTimer = 0.06;
    const drop = this.drops.find((d) => !d.alive);
    if (!drop) return;
    drop.alive = true;
    drop.mesh.visible = true;
    drop.mesh.position.set(
      localPos.x + (Math.random() - 0.5) * 0.04,
      localPos.y - 0.02,
      localPos.z + (Math.random() - 0.5) * 0.04,
    );
    drop.vel.set(0, -0.15, 0);
  }

  private updateDrops(dt: number): void {
    for (const drop of this.drops) {
      if (!drop.alive) continue;
      drop.vel.y -= 3.5 * dt;
      drop.mesh.position.addScaledVector(drop.vel, dt);
      if (drop.mesh.position.y < SOIL_Y + 0.006) {
        drop.alive = false;
        drop.mesh.visible = false;
        if (Math.random() < 0.35) sfx.drip();
      }
    }
  }
}

function clampInset(v: number, min: number, max: number, inset: number): number {
  if (max - min < inset * 2) return (min + max) / 2;
  return Math.min(max - inset, Math.max(min + inset, v));
}

function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
