const PREVIEW_WIDTH = 2.4;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function muqarnasPreviewMetrics(payload = {}) {
  const instances = Array.isArray(payload.instances) ? payload.instances : [];
  const levels = new Map((Array.isArray(payload.levels) ? payload.levels : []).map((level) => [level.id, finite(level.height)]));
  if (!instances.length) return { width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, depth: PREVIEW_WIDTH, minY: -PREVIEW_WIDTH / 2 };

  const points = [];
  instances.forEach((instance) => {
    const transform = instance?.transform || {};
    const levelHeight = levels.get(instance.levelId || instance.tierId) || 0;
    const position = Array.isArray(transform.position) ? transform.position : [0, levelHeight, 0];
    const scale = Array.isArray(transform.scale) ? transform.scale : [1, 1, 1];
    const sx = Math.max(0.12, Math.abs(finite(scale[0], 1)) * 0.5);
    const sy = Math.max(0.12, Math.abs(finite(scale[1], 1)) * 0.5);
    const sz = Math.max(0.12, Math.abs(finite(scale[2], 1)) * 0.5);
    const x = finite(position[0]);
    const y = finite(position[1], levelHeight);
    const z = finite(position[2]);
    points.push([x - sx, y - sy, z - sz], [x + sx, y + sy, z + sz]);
  });

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const zs = points.map(([, , z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const previewScale = PREVIEW_WIDTH / Math.max(maxX - minX, 0.001);
  return {
    width: PREVIEW_WIDTH,
    height: Math.max(0.05, (maxY - minY) * previewScale),
    depth: Math.max(0.05, (maxZ - minZ) * previewScale),
    minY: (minY - (minY + maxY) / 2) * previewScale,
  };
}

export function portalMuqarnasTransform(building, walls, payload = null) {
  const sideTop = Math.max(
    Math.max(0.05, finite(building.height) + finite(walls.extraHeights?.east)),
    Math.max(0.05, finite(building.height) + finite(walls.extraHeights?.west)),
  );
  const openingWidth = Math.max(1, Math.min(
    finite(building.width, 1),
    finite(building.openingWidth, building.width),
  ));
  const metrics = muqarnasPreviewMetrics(payload || {});
  const scale = Math.max(0.05, openingWidth / Math.max(0.05, metrics.width));
  return {
    position: [0, sideTop - metrics.minY * scale, 0],
    rotation: [0, 180, 0],
    scale: [scale, scale, scale],
  };
}
