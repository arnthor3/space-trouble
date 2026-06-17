import fs from 'fs';

// Simple PNG parsing is complex, but we can use a quick trick.
// Let's just run node to see if we can read the image. We don't have a PNG decoder installed.
// Wait, we can run a shell command to see if we have 'graphicsmagick' or 'imagemagick' or 'sipi'.
// Let's print the file size.
console.log("No PNG decoder, we can guess or use another method.");
