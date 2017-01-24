import min from 'lodash/min'
import max from 'lodash/max'

import {getAngularDistance} from './helpers'

/**
 * @param {(Object|Object[])} geojson - https://tools.ietf.org/html/rfc7946
 * @param {('square'|'hexagon|hexagonA|hexagonB')} options.shape - default 'square'
 * @param {number} options.width - default 1000, min 500, max 50000
 * @param {[number, number]} options.center - [lng, lat] of grid origin
 * @param {Function} options.getAngularDistance - optional, maps width to angular distance
 */
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

  // populate grid
  let [dx, dy] = options.getAngularDistance(options.center, options.width)
  if (options.shape === 'hexagon' || options.shape === 'hexagonA') {
    dy = dy * Math.sqrt(3) / 2
  } else if (options.shape === 'hexagonB') {
    dx = dx * Math.sqrt(3) / 2
  }

  const output = []

  if (options.shape === 'square') {
    const minX = Math.floor((bbox[0] - options.center[0]) / dx)
    const maxX = Math.ceil((bbox[2] - options.center[0]) / dx)
    const minY = Math.floor((bbox[1] - options.center[1]) / dy)
    const maxY = Math.ceil((bbox[3] - options.center[1]) / dy)
    for (let nx = minX; nx <= maxX; nx++) {
      for (let ny = minY; ny <= maxY; ny++) {
        const x = options.center[0] + nx * dx
        const y = options.center[1] + ny * dy
        output.push({
          type: 'Polygon',
          id: [nx, ny].join('.').replace(/-/g, 'M'),
          properties: {
            address: [x, y]
          },
          coordinates: [[
            [x + 0.5 * dx, y + 0.5 * dy],
            [x - 0.5 * dx, y + 0.5 * dy],
            [x - 0.5 * dx, y - 0.5 * dy],
            [x + 0.5 * dx, y - 0.5 * dy]
          ]]
        })
      }
    }
  } else if (options.shape === 'hexagon' || options.shape === 'hexagonA') {
    const minX = Math.floor((bbox[0] - options.center[0]) / (dx * 0.75))
    const maxX = Math.ceil((bbox[2] - options.center[0]) / (dx * 0.75))
    for (let nx = minX; nx <= maxX; nx++) {
      const cy = options.center[1] + nx * dy * 0.5
      const minY = Math.floor((bbox[1] - cy) / dy)
      const maxY = Math.ceil((bbox[3] - cy) / dy)
      for (let ny = minY; ny <= maxY; ny++) {
        const x = options.center[0] + nx * dx * 0.75
        const y = cy + ny * dy
        output.push({
          type: 'Polygon',
          id: [nx, ny].join('.').replace(/-/g, 'M'),
          properties: {
            address: [x, y]
          },
          coordinates: [[
            [x + 0.5 * dx, y],
            [x + 0.25 * dx, y + 0.5 * dy],
            [x - 0.25 * dx, y + 0.5 * dy],
            [x - 0.5 * dx, y],
            [x - 0.25 * dx, y - 0.5 * dy],
            [x + 0.25 * dx, y - 0.5 * dy]
          ]]
        })
      }
    }
  } else if (options.shape === 'hexagonB') {
    const minY = Math.floor((bbox[1] - options.center[1]) / (dy * 0.75))
    const maxY = Math.ceil((bbox[3] - options.center[1]) / (dy * 0.75))
    for (let ny = minY; ny <= maxY; ny++) {
      const cx = options.center[0] + ny * dx * 0.5
      const minX = Math.floor((bbox[0] - cx) / dx)
      const maxX = Math.ceil((bbox[2] - cx) / dx)
      for (let nx = minX; nx <= maxX; nx++) {
        const x = cx + nx * dx
        const y = options.center[1] + ny * dy * 0.75
        output.push({
          type: 'Polygon',
          id: [nx, ny].join('.').replace(/-/g, 'M'),
          properties: {
            address: [x, y]
          },
          coordinates: [[
            [x, y + 0.5 * dy],
            [x - 0.5 * dx, y + 0.25 * dy],
            [x - 0.5 * dx, y - 0.25 * dy],
            [x, y - 0.5 * dy],
            [x + 0.5 * dx, y - 0.25 * dy],
            [x + 0.5 * dx, y + 0.25 * dy]
          ]]
        })
      }
    }
  }

  return output.filter(grid => {
    if (input.some(polygon => isInside(grid.address, polygon))) return true

    const points = []
    input.forEach(polygon => {
      polygon.forEach(linearRing => {
        points.push(...linearRing)
      })
    })

    return points.some(point => isInside(point, grid.coordinates))
  })
}

function isInside (point, polygon, ignoreHoles = false) {

}
