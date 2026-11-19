set -e
mkdir -p dist
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=dist/app.js --log-level=warning
cp index.html dist/ && cp public/* dist/
ls -la dist
