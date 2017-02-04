#! /usr/bin/env node

const program = require('commander')
const fs = require('fs')
const hextile = require('../dist/index')

program
  .description('Generate tile representations of polygon objects on map')
  .usage('[options] <infile> <outfile>')
  .option('-s --shape <shape>', 'square or hexagon tile', /^(square|hexagon)$/i, 'square')
  .option('-w --width <metre>', 'set tile width', parseFloat, 1000)
  .option('-t --tilt <deg>', 'rotate tile', parseFloat, 0)
  .option('-c --center <longitude,latitude>', 'center map at', parseLngLat)
  .arguments('<infile> <outfile>')
  .action(function (infile, outfile, options) {
    const geojson = JSON.parse(fs.readFileSync(infile))
    const output = hextile(geojson, {
      shape: options.shape,
      width: options.width,
      tilt: options.tilt,
      center: options.center
    })
    fs.writeFileSync(outfile, JSON.stringify(output, null, '\t'))
  })
  .parse(process.argv)

function parseLngLat (str) {
  const lnglat = str.split(',').map(parseFloat)
  if (lnglat.filter(v => !isNaN(v)).length === 2) return lnglat
}
