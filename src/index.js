import min from 'lodash/min'
import max from 'lodash/max'

import {equirectangular, polar2cartesian, dotProduct, linearSolver} from './helpers'

/**
 * @param {(Object|Object[])} geojson - https://tools.ietf.org/html/rfc7946
 * @param {('square'|'hexagon')} options.shape - default 'square'
 * @param {number} options.tilt - default 0
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
  options.tilt = options.tilt || 0
  options.width = options.width || 1000
  options.width = Math.max(options.width, 500)
  options.width = Math.min(options.width, 20000)
  options.center = options.center || [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  options.projection = options.projection || equirectangular(options.center, options.width)

  const forward = options.projection.forward
  const inverse = options.projection.inverse

  let output = {}

  const beta0 = polar2cartesian(options.tilt)

  if (options.shape === 'square') {
    const beta1 = polar2cartesian(options.tilt + 90)

    const k0 = {
      bound: [
        dotProduct(beta0, forward([bbox[0], bbox[1]])),
        dotProduct(beta0, forward([bbox[0], bbox[3]])),
        dotProduct(beta0, forward([bbox[2], bbox[1]])),
        dotProduct(beta0, forward([bbox[2], bbox[3]]))
      ]
    }
    k0.minIndex = Math.floor(min(k0.bound))
    k0.maxIndex = Math.ceil(max(k0.bound))

    const k1 = {
      bound: [
        dotProduct(beta1, forward([bbox[0], bbox[1]])),
        dotProduct(beta1, forward([bbox[0], bbox[3]])),
        dotProduct(beta1, forward([bbox[2], bbox[1]])),
        dotProduct(beta1, forward([bbox[2], bbox[3]]))
      ]
    }
    k1.minIndex = Math.floor(min(k1.bound))
    k1.maxIndex = Math.ceil(max(k1.bound))

    const getIntersection = linearSolver(beta0, beta1)

    for (let i = k0.minIndex; i < k0.maxIndex; i++) {
      output[i] = {}
      for (let j = k1.minIndex; j < k1.maxIndex; j++) {
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
          let range = [
            dotProduct(beta0, linearRing[n]),
            dotProduct(beta0, linearRing[n + 1])
          ]
          let start = Math.floor(min(range) + 1)
          let end = Math.ceil(max(range) - 1)
          if (end >= start) {
            const beta = [
              linearRing[n + 1][1] - linearRing[n][1],
              linearRing[n][0] - linearRing[n + 1][0]
            ]
            const k = linearRing[n][0] * linearRing[n + 1][1] -
              linearRing[n][1] * linearRing[n + 1][0]
            const getIntersection = linearSolver(beta0, beta)
            for (let i = start; i <= end; i++) {
              const intersection = getIntersection(i, k)
              const j = Math.floor(dotProduct(beta1, intersection))
              output[i][j].keep = true
              output[i - 1][j].keep = true
            }
          }

          range = [
            dotProduct(beta1, linearRing[n]),
            dotProduct(beta1, linearRing[n + 1])
          ]
          start = Math.floor(min(range) + 1)
          end = Math.ceil(max(range) - 1)
          if (end >= start) {
            const beta = [
              linearRing[n + 1][1] - linearRing[n][1],
              linearRing[n][0] - linearRing[n + 1][0]
            ]
            const k = linearRing[n][0] * linearRing[n + 1][1] -
              linearRing[n][1] * linearRing[n + 1][0]
            const getIntersection = linearSolver(beta1, beta)
            for (let j = start; j <= end; j++) {
              const intersection = getIntersection(i, k)
              const i = Math.floor(dotProduct(beta0, intersection))
              output[i][j].keep = true
              output[i][j - 1].keep = true
            }
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
