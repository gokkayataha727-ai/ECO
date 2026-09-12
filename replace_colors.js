const fs = require('fs')

let css = fs.readFileSync('src/index.css', 'utf-8')

const replacements = {
  '#5d9b62': '#a67658',
  'rgba(93,155,98,.14)': 'rgba(166,118,88,.14)',
  '#5e8560': '#8c6751',
  'rgba(81,121,83,.22)': 'rgba(140,103,81,.22)',
  '#4b704e': '#735341',
  '#78946f': '#a68a78',
  '#edf3e9': '#f4eee9',
  '#668365': '#8c6751',
  '#3f603f': '#6b4e3d',
  '#557255': '#735341',
  '#a6c49e': '#d4b79f',
  '#f0f7ed': '#f9f3ec',
  '#426c46': '#735341',
  '#83ad7c': '#d4b79f',
  '#a8cba1': '#d4b79f',
  '#71a36a': '#a67658',
  'rgba(113,163,106,.16)': 'rgba(166,118,88,.16)',
  'rgba(113,163,106,0)': 'rgba(166,118,88,0)',
  '#567c58': '#8c6751',
  '#426646': '#735341',
  '#c6d2c3': '#d3c4bc',
  '#628c5d': '#8c6751',
  '#5e9261': '#8c6751',
  'rgba(84,139,87,.25)': 'rgba(140,103,81,.25)',
  '#5b7b57': '#8a6a57',
  '#eaf3e7': '#f4ede7',
  '#7b9876': '#a68a78',
  '#648862': '#8c6751',
  '#5b825c': '#8c6751',
  '#476a48': '#735341',
  '#7f9a71': '#a68a78',
  '#eaf1e5': '#f4eee9',
  '#4c6f4c': '#735341',
  '#e7f0e3': '#f4eee9',
  '#628460': '#8c6751',
  '#3e5f40': '#735341',
  '#2e4c30': '#5c4031',
  '#81a97c': '#a67658',
  '#c9dec4': '#e3d1c5',
  '#7fa67a': '#a67658',
  'rgba(126,154,111,.48)': 'rgba(166,118,88,.48)',
  '#91ab86': '#a67658',
  'rgba(145,171,134,.14)': 'rgba(166,118,88,.14)',
  '#5b845b': '#a67658',
  '#edf6eb': '#f9f3ec',
  '#577656': '#8c6751',
  '#dcebd9': '#e6d8ce',
  '#536b52': '#735341',
  '#f2f8f0': '#f9f3ec',
}

Object.entries(replacements).forEach(([from, to]) => {
  // Use regex to replace globally
  const escapedFrom = from.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
  css = css.replace(new RegExp(escapedFrom, 'g'), to)
})

fs.writeFileSync('src/index.css', css, 'utf-8')
