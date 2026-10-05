/**
 * Component declarations for Desk Garden. System-free so the editor can
 * import them (see AGENTS.md).
 */

import { createComponent, Types } from '@iwsdk/core';

/** A ray/poke button; `action` is handled by GardenSystem. */
export const GardenButton = createComponent('GardenButton', {
  action: { type: Types.String, default: '' },
});
