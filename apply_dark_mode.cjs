const fs = require('fs')

let css = fs.readFileSync('src/index.css', 'utf-8')

const darkThemeReplacements = {
  // Base
  '#f6f3ee': '#120f0e',
  '#2e211c': '#f2e9e4',
  'rgba(230, 216, 203, .55)': 'rgba(201, 155, 123, 0.08)',
  'rgba(244, 220, 184, .38)': 'rgba(217, 174, 145, 0.05)',
  
  // Topbar
  'rgba(93, 72, 56, .10)': 'rgba(255, 255, 255, 0.06)',
  'rgba(255, 254, 251, .86)': 'rgba(26, 22, 20, 0.86)',
  'rgba(62, 42, 27, .07)': 'rgba(0, 0, 0, 0.3)',
  '#34231b': '#f2e9e4',
  '#fffaf4': '#120f0e',
  '#988779': '#9f8c80',
  '#a67658': '#c99b7b',
  'rgba(166,118,88,.14)': 'rgba(201,155,123,.2)',
  '#726155': '#d4b79f',
  '#f0ebe5': '#2e241f',
  '#735341': '#d4b79f',
  '#f9f3ec': '#2e241f',
  '#ece6df': '#302722',
  '#75655a': '#a89a8f',
  '#fffdfa': '#1f1a18',
  '#33231b': '#f2e9e4',
  '#ddcbbb': '#4a3c35',
  '#fff': '#1a1614',
  
  // Surface
  'rgba(93, 72, 56, .1)': 'rgba(255, 255, 255, 0.06)',
  'rgba(255,254,251,.91)': 'rgba(26, 22, 20, 0.91)',
  'rgba(62,42,27,.06)': 'rgba(0, 0, 0, 0.3)',
  
  // Text
  '#a67658': '#c99b7b',
  '#33231b': '#f2e9e4',
  '#897a70': '#897a70',
  
  // Search
  '#e9e1d8': '#302722',
  '#958075': '#958075',
  '#fbfaf7': '#1a1614',
  '#b48c70': '#c99b7b',
  'rgba(180,140,112,.12)': 'rgba(201,155,123,.15)',
  '#3c2c23': '#f2e9e4',
  '#b0a197': '#7d7066',
  '#8c7b70': '#8c7b70',
  '#f0ece7': '#2e241f',
  
  // Tabs
  '#ebe3dc': '#302722',
  '#79695e': '#a89a8f',
  '#fff7f0': '#2e241f',
  '#d4b79f': '#4a3c35',
  '#fffaf7': '#120f0e',
  '#473126': '#c99b7b',
  'rgba(71,49,38,.16)': 'rgba(201,155,123,.3)',
  
  // Products
  '#eee6df': '#302722',
  '#fffdfb': '#1f1a18',
  '#d7bca6': '#4a3c35',
  'rgba(65,41,27,.08)': 'rgba(0, 0, 0, 0.3)',
  'rgba(166,118,88,.48)': 'rgba(201,155,123,.48)',
  '#a65f35': '#d69470',
  '#f8e7d7': '#35231a',
  '#4b8093': '#7dbcd1',
  '#dceef0': '#1d2d33',
  '#a76b70': '#d18f95',
  '#f7e3df': '#331f22',
  '#a2783c': '#d1a156',
  '#f5ead1': '#332717',
  '#648759': '#92b885',
  '#e4efe0': '#212b1d',
  '#81552d': '#e6cba3',
  '#fbebd5': '#3a2b1a',
  '#3a2a20': '#f2e9e4',
  '#9b8a7f': '#9f8c80',
  '#3b291f': '#e3d1c5',
  '#8c6751': '#c99b7b',
  'rgba(140,103,81,.22)': 'rgba(201,155,123,.22)',
  '#735341': '#d9ae91',
  
  // Empty
  '#a68a78': '#7d7066',
  '#f4eee9': '#2e241f',
  
  // Cart
  '#eee8e1': '#302722',
  '#9b8b80': '#a89a8f',
  '#b3634f': '#d17562',
  '#8d4534': '#e68c78',
  '#8c6751': '#c99b7b',
  '#6b4e3d': '#d9ae91',
  '#f1ece7': '#2e241f',
  '#3b2a20': '#f2e9e4',
  '#a08e82': '#a89a8f',
  '#e9e2db': '#302722',
  '#765f50': '#a89a8f',
  '#3e2b20': '#f2e9e4',
  '#f7f2ed': '#2e241f',
  '#544238': '#f2e9e4',
  '#443027': '#e3d1c5',
  '#b96d5b': '#d17562',
  '#fff6f3': '#2e1d1a',
  '#913f31': '#e68c78',
  '#fee9e4': '#3d231e',
  
  // Cart Bottom
  '#d9cfc5': '#4a3c35',
  '#7a6658': '#a89a8f',
  '#fdfaf7': '#1f1a18',
  '#ece4dc': '#302722',
  '#5d4a3e': '#e3d1c5',
  '#fcfaf7': '#1a1614',
  '#b8957a': '#c99b7b',
  'rgba(184,149,122,.12)': 'rgba(201,155,123,.15)',
  '#8a796d': '#a89a8f',
  '#dfd4ca': '#302722',
  '#392820': '#f2e9e4',
  '#35251c': '#c99b7b',
  'rgba(52,35,27,.17)': 'rgba(201,155,123,.2)',
  '#1f1713': '#d9ae91',
  '#fffdf9': '#120f0e',
  '#b5aca6': '#5c473c',
  '#e6e1db': '#2e241f',
  '#efd7ce': '#4a2820',
  '#734b3f': '#e68c78',
  '#fff4ef': '#2e1d1a',
  '#795142': '#e68c78',
  '#f0ded5': '#3d231e',
  '#ae624c': '#d17562',
  
  // Overlay
  'rgba(42,29,22,.32)': 'rgba(0,0,0,0.6)',
  'rgba(255,255,255,.55)': 'rgba(255,255,255,0.08)',
  'rgba(38,24,17,.24)': 'rgba(0,0,0,0.4)',
  '#f0e9e2': '#302722',
  '#856f62': '#a89a8f',
  '#f7f3ef': '#2e241f',
  '#472f24': '#f2e9e4',
  '#ede6df': '#3d3029',
  '#3a281f': '#f2e9e4',
  '#eae1d8': '#302722',
  '#7b675a': '#a89a8f',
  '#e6d8ce': '#302722',
  'rgba(166,118,88,.16)': 'rgba(201,155,123,.16)',
  '#e6ddd4': '#302722',
  '#432e23': '#f2e9e4',
  '#a97e63': '#c99b7b',
  'rgba(169,126,99,.12)': 'rgba(201,155,123,.15)',
  '#e9e2dc': '#302722',
  '#725c4e': '#a89a8f',
  '#fcfaf8': '#1f1a18',
  '#f6eee8': '#2e241f',
  
  // Success
  '#e4ede1': '#2e241f',
  '#e4dbd3': '#302722',
  '#654f40': '#e3d1c5',
  '#3b2b21': '#e3d1c5',
  '#faf5f0': '#2e241f',
  '#251a15': '#f2e9e4',
  'rgba(140,103,81,.25)': 'rgba(201,155,123,.25)',
  '#88766a': '#a89a8f',
  
  // QR & Other
  '#3c2b22': '#302722',
  
  // Adisyon
  '#e7ded5': '#302722',
  '#4a372c': '#e3d1c5',
  '#fffaf5': '#1f1a18',
  '#cfbfb1': '#302722',
  '#927c6d': '#a89a8f',
  '#8a6a57': '#c99b7b',
  '#f4ede7': '#2e241f',
  '#8d786a': '#a89a8f',
  '#eee4db': '#302722',
  '#a38e7e': '#897a70',
  '#f0e7df': '#302722',
  '#4b372b': '#e3d1c5',
  '#a18d80': '#897a70',
  '#8a7669': '#a89a8f',
  '#5b483c': '#e3d1c5',
  '#82674f': '#c99b7b',
  '#f7eddf': '#2e241f',
  '#aa9789': '#a89a8f',
  '#a38f80': '#a89a8f',
  
  // Manager
  '#eee6de': '#302722',
  '#e8e0d8': '#302722',
  '#9b897c': '#a89a8f',
  '#4b392f': '#f2e9e4',
  '#a08d80': '#a89a8f',
  '#f1ebe5': '#241e1b',
  '#4d392e': '#f2e9e4',
  '#a28e80': '#a89a8f',
  '#937c6c': '#a89a8f',
  '#ad5d4b': '#d17562',
  '#fbe9e3': '#3d231e',
  '#efd5ca': '#4a2820',
  '#805244': '#e68c78',
  '#fff3ef': '#2e1d1a',
  '#ad604b': '#d17562',
  '#765c4e': '#e68c78',
  '#f1dfd8': '#3d231e',
  
  // Summary
  'rgba(49,34,25,.15)': 'rgba(0,0,0,0.3)',
  '#fefcf9': '#1f1a18',
  '#927f72': '#a89a8f',
  '#4b382d': '#e3d1c5',
  '#ede5dd': '#302722',
  '#e3d1c5': '#2e241f',
  '#aa998d': '#a89a8f',
  '#efe8e0': '#2e241f',
  '#d4a676': '#a67658',
  '#665246': '#a89a8f',
  '#8a6d57': '#c99b7b',
  '#f4ebe3': '#2e241f',
  '#8b7b70': '#a89a8f',
  
  // Help
  '#6d5a4e': '#a89a8f',
  '#faf6f1': '#1f1a18',
  '#dfd5cc': '#302722',
  '#5c493d': '#f2e9e4',
}

// Ensure the #fff at the end doesn't mess up previously replaced stuff by sorting by length desc
const sortedEntries = Object.entries(darkThemeReplacements).sort((a, b) => b[0].length - a[0].length)

sortedEntries.forEach(([from, to]) => {
  css = css.replaceAll(from, to)
})

// Specific fixes
css = css.replace('background: #1a1614;', 'background: #120f0e; /* fixed button text */')
css = css.replace('.receipt { background: #1f1a18;', '.receipt { background: #1a1614;')
css = css.replace('.receipt-wrap { background: #120f0e;', '.receipt-wrap { background: #0f0c0b;')
css = css.replace('.brand-mark {\\n  display: grid;', '.brand-mark {\\n  background: transparent !important;\\n  box-shadow: none !important;\\n  color: #c99b7b;\\n  display: grid;')

fs.writeFileSync('src/index.css', css, 'utf-8')
console.log("Dark theme applied!")
