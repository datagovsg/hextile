export function equirectangular (center, width, radius = 6371000) {
  const rad2deg = 180 / Math.PI
  const dy = width / radius * rad2deg
  const dx = width / (Math.cos(center[1] / rad2deg) * radius) * rad2deg
  return {
    forward ([lng, lat]) {
      return [(lng - center[0]) / dx, (lat - center[1]) / dy]
    },
    inverse ([x, y]) {
      return [center[0] + x * dx, center[1] + y * dy]
    }
  }
}

export function polar2cartesian (theta) {
  return [
    Math.sin(theta / 180 * Math.PI),
    -Math.cos(theta / 180 * Math.PI)
  ]
}

export function dotProduct (v1, v2) {
  return v1.reduce((sum, e, i) => sum + e * v2[i], 0)
}

export function linearSolver ([alpha1, beta1], [alpha2, beta2]) {
  const DET = alpha1 * beta2 - alpha2 * beta1
  return function (d1, d2) {
    return [
      (beta2 * d1 - beta1 * d2) / DET,
      (-alpha2 * d1 + alpha1 * d2) / DET
    ]
  }
}

export function isInside ([lng, lat], linearRing) {
  let isInside = false
  for (let i = 1; i < linearRing.length; i++) {
    const deltaYplus = linearRing[i][1] - lat
    const deltaYminus = lat - linearRing[i - 1][1]
    if (deltaYplus > 0 && deltaYminus <= 0) continue
    if (deltaYplus < 0 && deltaYminus >= 0) continue
    const deltaX = (deltaYplus * linearRing[i - 1][0] + deltaYminus * linearRing[i][0]) /
      (deltaYplus + deltaYminus) - lng
    if (deltaX <= 0) continue
    isInside = !isInside
  }
  return isInside
}

export function bbox2geojson (bbox) {
  return {
    type: 'Polygon',
    coordinates: [
      [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]
    ]
  }
}
