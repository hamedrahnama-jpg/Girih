export function fittedOrthographicHalfHeight({
  frameWidth,
  frameHeight,
  aspect,
  padding = 1.14,
  zoom = 1,
}) {
  const safeWidth = Math.max(0.001, Number(frameWidth) || 0.001);
  const safeHeight = Math.max(0.001, Number(frameHeight) || 0.001);
  const safeAspect = Math.max(0.001, Number(aspect) || 1);
  const safePadding = Math.max(1, Number(padding) || 1);
  const safeZoom = Math.max(0.5, Number(zoom) || 1);
  return Math.max(safeHeight * 0.5, safeWidth * 0.5 / safeAspect) * safePadding / safeZoom;
}
