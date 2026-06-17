import fs from 'fs';

const buffer = fs.readFileSync('/Users/arnthor/Development/@odinos/space-trouble/src/assets/Monsters/Slime/attack.png');
const width = buffer.readInt32BE(16);
const height = buffer.readInt32BE(20);
console.log(`Dimensions: ${width}x${height}`);
