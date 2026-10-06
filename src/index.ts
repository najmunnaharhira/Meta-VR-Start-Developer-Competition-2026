import { DepthSensingSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GardenSystem } from './garden-system.js';
import { PanelSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Lets real hands occlude the plant on headsets that expose depth (Quest 3).
  world.registerSystem(DepthSensingSystem, {
    configData: {
      enableDepthTexture: true,
      enableOcclusion: true,
      useFloat32: true,
      blurRadius: 20,
    },
  });
  world.registerSystem(GardenSystem);
  world.registerSystem(PanelSystem);
});
