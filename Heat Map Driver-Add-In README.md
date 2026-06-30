[README.md](https://github.com/user-attachments/files/29499817/README.md)
# Heat Map Add-In — Driver Filter Modification

This is a modified version of Geotab's official `addin-heatmap` sample
(https://github.com/Geotab/sdk-addin-samples/tree/master/addin-heatmap),
extended to let users filter results by driver in addition to vehicle.

## What changed

### `heatmap.html`
- Added a multi-select `<select id="drivers">` control with an "All Drivers"
  default option, placed under the existing Vehicle(s) selector.
- Added a hint explaining that driver filtering is slower for Location
  History (see below).

### `scripts/main.js`
- Rewritten as plain ES5 using `api.callAsync` / `api.multiCallAsync`
  (Promise-based) instead of callback style, to keep the join logic readable.
- Populates the new driver dropdown via `Get User` with `search: { isDriver: true }`
  (per Geotab SDK guidance, never query `typeName: "Driver"`).
- **Exception History mode**: `ExceptionEvent` has a native `driver` reference,
  so driver filtering is a simple `driverSearch` added to the existing
  `deviceSearch` / `ruleSearch` query — no behavioral change in approach,
  just an added search parameter.
- **Location History mode**: `LogRecord` (GPS breadcrumbs) has **no driver
  field**, so driver filtering can't be done as a direct query parameter.
  Instead the add-in:
  1. Queries `Trip` (which does have `driver`) for the selected driver(s) +
     date range, to get `{deviceId, start, stop}` windows.
  2. Fires one `LogRecord` query per window (batched via `multiCallAsync`,
     50 calls per batch) and merges the results.
  3. Falls back to the original single-query-per-device behavior when no
     driver is selected, so unfiltered location history is unaffected in
     speed or behavior.

## Known limitations / things to validate before production use

1. **Performance**: the Trip → LogRecord join means driver-filtered location
   history does noticeably more API calls than the device-only path,
   proportional to number of trips in range. Fine for a day or a week;
   for month+ ranges across many drivers you may want to add UI guardrails
   (e.g. warn or block ranges beyond N days when a driver filter is active).
2. **Exception event coordinates**: the sample assumes `ExceptionEvent`
   records carry `latitude`/`longitude` directly. Depending on your Geotab
   database/firmware version this isn't always populated on every event type —
   you may need to fall back to resolving the nearest `LogRecord` by device +
   timestamp for events missing coordinates.
3. **Untested against a live database** — this was written against the
   public Geotab SDK reference (entity shapes, `isDriver`, `driver` on
   `Trip`/`ExceptionEvent`) but hasn't been run against a real MyGeotab
   instance. Recommend testing in a demo database first, particularly the
   `multiCallAsync` batching and the driver/"All Drivers" toggle UX.
4. **Leaflet/build tooling**: the original repo is built with Bower + a
   Webpack/gulp pipeline (per `generator-addin`). These two files assume that
   same build setup (or that you inline Leaflet via CDN, like the production
   `config.json` does with `cdn.jsdelivr.net`). If you're hosting this
   yourself rather than rebuilding via the generator, swap the
   `bower_components` `<script>`/`<link>` tags for CDN equivalents.
5. Long-term, given you're already on the modern Geotab API patterns
   elsewhere (per your other Geotab work), it's worth considering the
   "clean rebuild" option you mentioned — current SDK guidance favors
   `api.callAsync`/Promises and a generator-scaffolded build, which this
   patch approximates but doesn't fully modernize (no Zenith styling, no
   webpack bundling).

## Files
- `heatmap.html` — UI markup
- `scripts/main.js` — add-in logic
