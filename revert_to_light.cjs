const fs = require('fs');
const content = fs.readFileSync('apply_dark_mode.cjs', 'utf-8');

// extract the object
const match = content.match(/const darkThemeReplacements = (\{[\s\S]*?\n\})/);
if (!match) {
  console.error("Could not find object");
  process.exit(1);
}

// Dangerously eval it
const darkThemeReplacements = eval('(' + match[1] + ')');

let css = fs.readFileSync('src/index.css', 'utf-8');

// Reverse the mapping
const lightThemeReplacements = {};
for (const [light, dark] of Object.entries(darkThemeReplacements)) {
  lightThemeReplacements[dark] = light;
}

// Special fixes for the background that I manually made white
css = css.replace(/background: #ffffff;/g, 'background: #f6f3ee;');

// Ensure longest dark colors are replaced first to avoid partial replacements
const sortedEntries = Object.entries(lightThemeReplacements).sort((a, b) => b[0].length - a[0].length);

sortedEntries.forEach(([dark, light]) => {
  css = css.replaceAll(dark, light);
});

// Restore some specific fixes
css = css.replace('background: transparent !important;', 'background: #34231b;');
css = css.replace('box-shadow: none !important;', 'box-shadow: inset 0 -4px 8px rgba(0, 0, 0, .16);');
css = css.replace('color: #c99b7b;\\n  display: grid;', 'color: #fffaf4;\\n  display: grid;');
// specific fix for brand-mark manual addition:
css = css.replace('.brand-mark {\\n  background: #34231b;\\n  box-shadow: inset 0 -4px 8px rgba(0, 0, 0, .16);\\n  color: #fffaf4;\\n  display: grid;', '.brand-mark {\\n  display: grid;');
// Re-apply if it failed:
css = css.replace('background: #120f0e; /* fixed button text */', 'background: #f6f3ee;');

fs.writeFileSync('src/index.css', css, 'utf-8');
console.log('Reverted to light mode');
