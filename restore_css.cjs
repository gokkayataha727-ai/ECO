const fs = require('fs');

const logPath = '/Users/macboookpro15/.gemini/antigravity-ide/brain/137a3d4d-7946-4af2-ba5f-ea15ba36610f/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
  if (!line) continue;
  try {
    const json = JSON.parse(line);
    if (json.type === 'TOOL_RESPONSE' && json.content.includes('File Path: `file:///Users/macboookpro15/Desktop/ecodemo1/src/index.css`')) {
      const match = json.content.match(/Showing lines 1 to 170[\s\S]+?1: ([\s\S]+?)The above content shows/);
      if (match) {
        let originalContent = match[1];
        // Remove line numbers "1: ", "2: ", etc.
        originalContent = originalContent.replace(/^\d+: /gm, '');
        fs.writeFileSync('/Users/macboookpro15/Desktop/ecodemo1/src/index.css', originalContent);
        console.log('Restored original index.css');
        break;
      }
    }
  } catch (e) {}
}
