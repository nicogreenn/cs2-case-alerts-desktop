# CS2 Case Alerts (Desktop)

Electron desktop app that watches CS2 case prices on Steam and alerts you when:
- **Buy ≤** your target
- **Profit ≥** your target (with fee math)
- Includes a **Profit Calculator** to set sell targets for a chosen ROI after fees.

## Seeded Watches (GBP)
- Revolution Case — buy≤ **£0.32**, sell≥ **£0.43**
- Kilowatt Case — buy≤ **£0.26**, sell≥ **£0.35**
- Fracture Case — buy≤ **£0.24**, sell≥ **£0.32**
- Dreams & Nightmares Case — buy≤ **£1.37**, sell≥ **£1.85**

> Sell targets assume 15% net profit **after** a 15% Steam fee. Formula: `S = (B * (1 + r)) / (1 - f)` with r=0.15, f=0.15.

## Dev Run
```bash
npm ci
npm run dev
```

## Build (local)
```bash
npm run dist
```
Output installer is in `dist/`.

## GitHub Actions (Windows)
Push to `main` and the workflow at `.github/workflows/windows-build.yml` will build and upload the installer as an artifact.
