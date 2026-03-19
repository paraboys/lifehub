const fs = require('fs');
const path = require('path');

const superAppPath = path.join(__dirname, 'src', 'components', 'SuperAppPage.jsx');
const uiElementsPath = path.join(__dirname, 'src', 'components', 'UiElements.jsx');

let content = fs.readFileSync(superAppPath, 'utf8').split('\n');

let start = -1;
let end = -1;

for (let i = 0; i < content.length; i++) {
  if (content[i].startsWith('function UiIcon({ name')) {
    start = i;
  } else if (start !== -1 && content[i] === '}') {
    end = i;
    break;
  }
}

if (start !== -1 && end !== -1) {
  let uiIconFunc = content.slice(start, end + 1);
  uiIconFunc[0] = uiIconFunc[0].replace('function UiIcon', 'export function UiIcon');

  let defaultIdx = uiIconFunc.findIndex(line => line.includes('default:'));
  
  const downloadSvg = `    case "download":
      nodes = (
         <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...style} />
          <polyline points="7 10 12 15 17 10" {...style} />
          <line x1="12" y1="15" x2="12" y2="3" {...style} />
         </>
      );
      break;`;

  uiIconFunc.splice(defaultIdx, 0, downloadSvg);

  const uiElementsContent = 'import React from "react";\n\n' + uiIconFunc.join('\n');
  fs.writeFileSync(uiElementsPath, uiElementsContent, 'utf8');

  content.splice(start, end - start + 1);
  
  let importIdx = content.findIndex(line => line.startsWith('import '));
  content.splice(importIdx + 1, 0, 'import { UiIcon } from "./UiElements.jsx";');

  fs.writeFileSync(superAppPath, content.join('\n'), 'utf8');
  console.log("Refactored UiIcon successfully");
} else {
  console.log("Could not find UiIcon in SuperAppPage.jsx");
}
