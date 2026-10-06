import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GardenSystem } from './garden-system.js';
import { PanelSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(GardenSystem);
  world.registerSystem(PanelSystem);
});
