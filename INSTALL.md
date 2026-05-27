# SA Network Coverage — Geotab Map Add-In
## Installation & Usage Guide

---

## What This Add-In Does

Adds a **"SA Coverage"** panel to the MyGeotab Map page with:
- **Tabbed interface** — switch between Vodacom and MTN coverage maps
- **Vehicle location sync** — centres the coverage map on a selected vehicle's last known GPS position
- **External link** — opens the provider's full coverage site in a new tab

---

## Files Included

| File | Purpose |
|------|---------|
| `sa-coverage-config.json` | Add-In configuration file (upload this to MyGeotab) |
| `sa-coverage-addin.html` | Add-In panel UI |
| `sa-coverage-addin.js` | Logic: network switching, Geotab API integration |
| `sa-coverage-addin.css` | Styling |

---

## Installation Steps

### Step 1 — Host the Add-In files

Upload the four files to a publicly accessible HTTPS web server.
Examples: Azure Blob Storage, AWS S3 (static website), GitHub Pages, Netlify.

Update the `src`, `style`, and `url` paths in `sa-coverage-config.json` to point to
your hosted URLs:

```json
"mapScript": {
  "src": "https://your-domain.com/addins/sa-coverage-addin.js",
  "style": "https://your-domain.com/addins/sa-coverage-addin.css",
  "url": "https://your-domain.com/addins/sa-coverage-addin.html"
}
```

> **Alternative (no hosting needed):** Geotab supports "embedded" Add-Ins where
> the JS/CSS/HTML are uploaded directly into MyGeotab as file attachments.
> See: https://geotab.github.io/sdk/software/guides/developing-addins/#embedded-addins

### Step 2 — Upload the configuration to MyGeotab

1. Log in to MyGeotab
2. Go to **Administration → System... → System Settings**
3. Click the **Add-Ins** tab
4. Click **New Add-In**
5. Upload `sa-coverage-config.json`
6. Click **OK** to save

### Step 3 — Open the Add-In

1. Navigate to the **Map** page in MyGeotab
2. Look for the **"SA Coverage"** tab in the right-side panel
3. The Vodacom coverage map loads by default

---

## Using the Add-In

### Switching Networks
Click **Vodacom** or **MTN** tabs at the top of the panel.

### Syncing to a Vehicle Location
- **Click a vehicle** on the MyGeotab map — the coverage map will automatically
  centre on that vehicle's last known GPS position.
- Or click the **"📍 Click to sync vehicle location"** button in the controls bar
  to use the first available active vehicle.

### Opening in Full Browser Tab
Click the **↗ Open** button to open the selected network's coverage site in a
full browser tab for easier searching.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Iframe shows blank / refuses to load | The network provider may have updated their CSP headers. Try the **↗ Open** button as a fallback. |
| "Geotab API not available" toast | The add-in JS loaded outside of MyGeotab context — only works inside MyGeotab. |
| Location button doesn't update map | Ensure the vehicle has a recent GPS fix and your user account has permission to view DeviceStatusInfo. |
| MTN map fails to load | MTN's coverage map is hosted at `mtnsi.mtn.co.za`. If their server blocks iframe embedding, use the ↗ Open button as a workaround. |

---

## Important Notes on Coverage Data

- Coverage data is provided directly by **Vodacom** (via AfriGIS) and **MTN**.
- This Add-In embeds their official maps — it does not modify, cache, or
  redistribute coverage data.
- Coverage map accuracy and availability is the responsibility of each provider.
- If either provider updates their coverage map URL, update the `baseUrl` values
  in `sa-coverage-addin.js`:

```javascript
networks: {
  vodacom: { baseUrl: 'https://vccoverage.afrigis.co.za/#/' },
  mtn:     { baseUrl: 'https://mtnsi.mtn.co.za/coverage/map3.html' }
}
```

---

## Customisation

### Change the Add-In name
Edit the `"name"` and `"title"` fields in `sa-coverage-config.json`.

### Add to Trips History page instead of (or as well as) Map
Add a second item in the `"items"` array with `"page": "tripsHistory"`.

### Support email
Update `"supportEmail"` in `sa-coverage-config.json` to your company address.

---

## Support

For Geotab Add-In SDK documentation:
https://developers.geotab.com/myGeotab/introduction/

For Map Add-In API reference:
https://geotab.github.io/sdk/software/guides/map-add-ins-docs/
