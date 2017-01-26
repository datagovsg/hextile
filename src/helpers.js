export function equirectangular (center, width, radius = 6371000) {
  const rad2deg = 180 / Math.PI
  const dy = width / radius * rad2deg
  const dx = width / (Math.cos(center[1] / rad2deg) * radius) * rad2deg
  return {
    forward ([lng, lat]) {
      return [lng / dx, lat / dy]
    },
    back ([x, y]) {
      return [x * dx, y * dy]
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
