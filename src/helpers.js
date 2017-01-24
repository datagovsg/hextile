export function getAngularDistance (radius = 6371000) {
  return function (center, width) {
    const rad2deg = 180 / Math.PI
    const ty = width / radius * rad2deg
    const tx = width / (Math.cos(center[1] / rad2deg) * radius) * rad2deg
    return [tx, ty]
  }
}
