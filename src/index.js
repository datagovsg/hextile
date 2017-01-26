import min from 'lodash/min'
import max from 'lodash/max'

import {equirectangular, polar2cartesian, dotProduct, linearSolver} from './helpers'

/**
 * @param {(Object|Object[])} geojson - https://tools.ietf.org/html/rfc7946
 * @param {('square'|'hexagon')} options.shape - default 'square'
 * @param {number} options.rotate - default 0
 * @param {number} options.width - default 1000, min 500, max 50000
 * @param {[number, number]} options.center - [lon, lat] of grid origin
 * @param {Object} options.projection - optional, overwrites center and width
 * @param {Function} options.projection.forward - map lonlat to grid coordinates
 * @param {Function} options.projection.inverse - map grid XY to lonlat
 */
module.exports = function (geojson, options) {
  // normalize input
  let input = []
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

  input = input.map(coordinates => ({
    coordinates,
    bbox: [
      min(coordinates[0], point => point[0]),
      min(coordinates[0], point => point[1]),
      max(coordinates[0], point => point[0]),
      max(coordinates[0], point => point[1])
    ]
  }))

  const bbox = [
    min(input.map(polygon => polygon.bbox[0])),
    min(input.map(polygon => polygon.bbox[1])),
    max(input.map(polygon => polygon.bbox[2])),
    max(input.map(polygon => polygon.bbox[3]))
  ]

  options.shape = options.shape || 'square'
  options.rotate = options.rotate || 0
  options.width = options.width || 1000
  options.width = Math.max(options.width, 500)
  options.width = Math.min(options.width, 20000)
  options.center = options.center || [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  options.projection = options.projection || equirectangular(options.center, options.width)

  const forward = options.projection.forward
  const inverse = options.projection.inverse

  let output = {}

  function dRange (beta, endpoints) {
    const dValues = endpoints.map(ep => dotProduct(beta, ep))
    return {
      min: Math.ceil(min(dValues) - 1),
      max: Math.floor(max(dValues) + 1)
    }
  }

  const corners = [
    forward([bbox[0], bbox[1]]),
    forward([bbox[0], bbox[3]]),
    forward([bbox[2], bbox[1]]),
    forward([bbox[2], bbox[3]])
  ]

  const beta0 = polar2cartesian(options.tilt)
  const dRange0 = dRange(beta0, corners)

  if (options.shape === 'square') {
    const beta1 = polar2cartesian(options.tilt + 90)
    const dRange1 = dRange(beta1, corners)

    const getIntersection = linearSolver(beta0, beta1)

    for (let i = dRange0.min; i <= dRange0.max; i++) {
      output[i] = {}
      for (let j = dRange1.min; j <= dRange1.max; j++) {
        output[i][j] = {
          properties: {
            address: getIntersection(i + 0.5, j + 0.5)
          },
          coordinates: [[
            getIntersection(i, j),
            getIntersection(i, j + 1),
            getIntersection(i + 1, j + 1),
            getIntersection(i + 1, j)
          ]]
        }
      }
    }

    input.forEach(polygon => {
      polygon.coordinates.forEach(linearRing => {
        linearRing = linearRing.map(forward)
        for (let n = 0; n < linearRing.length - 1; n++) {
          const beta = [
            linearRing[n + 1][1] - linearRing[n][1],
            linearRing[n][0] - linearRing[n + 1][0]
          ]
          const d = linearRing[n][0] * linearRing[n + 1][1] -
            linearRing[n][1] * linearRing[n + 1][0]

          const iRange = dRange(beta0, [linearRing[n], linearRing[n + 1]])
          const iIntersection = linearSolver(beta0, beta)
          for (let i = iRange.min; i <= iRange.max; i++) {
            const intersection = iIntersection(i, d)
            const j = Math.floor(dotProduct(beta1, intersection))
            output[i][j].keep = true
            output[i - 1][j].keep = true
          }

          const jRange = dRange(beta1, [linearRing[n], linearRing[n + 1]])
          const jIntersection = linearSolver(beta1, beta)
          for (let j = jRange.min; j <= jRange.max; j++) {
            const intersection = jIntersection(j, d)
            const i = Math.floor(dotProduct(beta0, intersection))
            output[i][j].keep = true
            output[i][j - 1].keep = true
          }
        }
      })
    })

    // const minX = Math.floor((bbox[0] - options.center[0]) / dx)
    // const maxX = Math.ceil((bbox[2] - options.center[0]) / dx)
    // const minY = Math.floor((bbox[1] - options.center[1]) / dy)
    // const maxY = Math.ceil((bbox[3] - options.center[1]) / dy)
    // for (let nx = minX; nx <= maxX; nx++) {
    //   for (let ny = minY; ny <= maxY; ny++) {
    //     const x = options.center[0] + nx * dx
    //     const y = options.center[1] + ny * dy
    //     output.push({
    //       type: 'Polygon',
    //       id: [nx, ny].join('.').replace(/-/g, 'M'),
    //       properties: {
    //         address: [x, y]
    //       },
    //       coordinates: [[
    //         [x + 0.5 * dx, y + 0.5 * dy],
    //         [x - 0.5 * dx, y + 0.5 * dy],
    //         [x - 0.5 * dx, y - 0.5 * dy],
    //         [x + 0.5 * dx, y - 0.5 * dy]
    //       ]]
    //     })
    //   }
    // }
  } else if (options.shape === 'hexagon') {
    const beta1 = polar2cartesian(options.rotate + 60)
    const beta2 = polar2cartesian(options.rotate + 120)
    const dRange1 = dRange(beta1, corners)

    const getIntersection01 = linearSolver(beta0, beta1)
    const getIntersection12 = linearSolver(beta1, beta2)
    const getIntersection20 = linearSolver(beta2, beta0)

    for (let i = dRange0.min; i <= dRange0.max; i++) {
      output[i] = {}
      for (let j = dRange1.min; j <= dRange1.max; j++) {
        output[i][j] = {}
        output[i][j][1 - i - j] = {}
        output[i][j][-1 - i - j] = {}
      }
    }

    input.forEach(polygon => {
      polygon.coordinates.forEach(linearRing => {
        linearRing = linearRing.map(forward)
        for (let n = 0; n < linearRing.length - 1; n++) {
          const beta = [
            linearRing[n + 1][1] - linearRing[n][1],
            linearRing[n][0] - linearRing[n + 1][0]
          ]
          const d = linearRing[n][0] * linearRing[n + 1][1] -
            linearRing[n][1] * linearRing[n + 1][0]

          const iRange = dRange(beta0, [linearRing[n], linearRing[n + 1]])
          const iIntersection = linearSolver(beta0, beta)
          for (let i = iRange.min; i <= iRange.max; i++) {
            const intersection = iIntersection(i, d)
            const j = Math.floor(dotProduct(beta1, intersection))
            const k = Math.floor(dotProduct(beta2, intersection))
            if (i + j + k === 1 || i + j + k === -1) {
              output[i][j][k].keep = true
              output[i][j + 1][k + 1].keep = true
            } else {
              output[i][j + 1][k].keep = true
              output[i][j][k + 1].keep = true
            }
          }

          const jRange = dRange(beta2, [linearRing[n], linearRing[n + 1]])
          const jIntersection = linearSolver(beta1, beta)
          for (let j = jRange.min; j <= jRange.max; j++) {
            const intersection = jIntersection(j, d)
            const i = Math.floor(dotProduct(beta0, intersection))
            const k = Math.floor(dotProduct(beta2, intersection))
            if (i + j + k === 1 || i + j + k === -1) {
              output[i][j][k].keep = true
              output[i + 1][j][k + 1].keep = true
            } else {
              output[i + 1][j][k].keep = true
              output[i][j][k + 1].keep = true
            }
          }

          const kRange = dRange(beta2, [linearRing[n], linearRing[n + 1]])
          const kIntersection = linearSolver(beta2, beta)
          for (let k = kRange.min; k <= kRange.max; k++) {
            const intersection = kIntersection(k, d)
            const i = Math.floor(dotProduct(beta0, intersection))
            const j = Math.floor(dotProduct(beta1, intersection))
            if (i + j + k === 1 || i + j + k === -1) {
              output[i][j][k].keep = true
              output[i + 1][j + 1][k].keep = true
            } else {
              output[i + 1][j][k].keep = true
              output[i][j + 1][k].keep = true
            }
          }
        }
      })
    })
    // const minX = Math.floor((bbox[0] - options.center[0]) / (dx * 0.75))
    // const maxX = Math.ceil((bbox[2] - options.center[0]) / (dx * 0.75))
    // for (let nx = minX; nx <= maxX; nx++) {
    //   const cy = options.center[1] + nx * dy * 0.5
    //   const minY = Math.floor((bbox[1] - cy) / dy)
    //   const maxY = Math.ceil((bbox[3] - cy) / dy)
    //   for (let ny = minY; ny <= maxY; ny++) {
    //     const x = options.center[0] + nx * dx * 0.75
    //     const y = cy + ny * dy
    //     output.push({
    //       type: 'Polygon',
    //       id: [nx, ny].join('.').replace(/-/g, 'M'),
    //       properties: {
    //         address: [x, y]
    //       },
    //       coordinates: [[
    //         [x + 0.5 * dx, y],
    //         [x + 0.25 * dx, y + 0.5 * dy],
    //         [x - 0.25 * dx, y + 0.5 * dy],
    //         [x - 0.5 * dx, y],
    //         [x - 0.25 * dx, y - 0.5 * dy],
    //         [x + 0.25 * dx, y - 0.5 * dy]
    //       ]]
    //     })
    //   }
    // }
  }
}
