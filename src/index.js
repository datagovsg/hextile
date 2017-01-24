import min from 'lodash/min'
import max from 'lodash/max'

import {getAngularDistance} from './helpers'

module.exports = function (geojson, options) {
  // normalize input
  const input = []
  function extractPolygons (node) {
    if (typeof node !== 'object') return
    if (node instanceof Array) {
      node.forEach(extractPolygons)
    } else if (node.type === 'Polygon') {
      input.push(node.coordinates)
    } else if (node.type === 'MultiPolygon') {
      input.push(...node.coordinates)
    } else if (node.type === 'Feature') {
      extractPolygons(node.geometry)
    } else if (node.type === 'GeometryCollection') {
      node.geometries.forEach(extractPolygons)
    } else if (node.type === 'FeatureCollection') {
      node.features.forEach(extractPolygons)
    }
  }
  extractPolygons(geojson)

  const bbox = [
    min(input.map(polygon => min(polygon[0], point => point[0]))),
    min(input.map(polygon => min(polygon[0], point => point[1]))),
    max(input.map(polygon => max(polygon[0], point => point[0]))),
    max(input.map(polygon => max(polygon[0], point => point[1])))
  ]

  options.shape = options.shape || 'square'
  options.width = options.width || 1000
  options.width = Math.max(options.width, 500)
  options.width = Math.min(options.width, 20000)
  options.center = options.center || [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  options.getAngularDistance = options.getAngularDistance || getAngularDistance()

  let [tx, ty] = options.getAngularDistance(options.center, options.width)
  if (options.shape === 'hexagon') ty = ty * Math.sqrt(3) / 2
  else if (options.shape === 'hexagonA') ty = ty * Math.sqrt(3) / 2
  else if (options.shape === 'hexagonB') tx = tx * Math.sqrt(3) / 2
}
