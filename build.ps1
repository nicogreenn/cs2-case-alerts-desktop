
# Windows build helper
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "npm not found. Install Node.js LTS first: https://nodejs.org/"
  exit 1
}
npm ci
npm run dist
