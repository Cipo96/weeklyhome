export * from './types.js';
export {
  addQuantities,
  scaleQuantity,
  toBase,
  normalizeForDisplay,
  dimensionOf,
} from './units.js';
export { computeConsumption } from './consumption.js';
export { buildShoppingList } from './shopping-list.js';
export { optimizeCheapest, optimizeFewestStops } from './optimization.js';
