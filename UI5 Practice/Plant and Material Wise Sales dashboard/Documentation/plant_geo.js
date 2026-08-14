/* =====================================================================
   ⚠⚠ SUPERSEDED — DO NOT USE AS-IS ⚠⚠
   ---------------------------------------------------------------------
   The 10 plants below were read from SAP client 120, a near-empty
   sandbox. PRODUCTION HAS ~109 PLANTS WITH INVOICES, so this table is
   roughly 10% complete and plantDots() would omit ~99 dots (it warns to
   console rather than crashing, but the map would look near-empty).

   Extending it by lookup is not an option either: the template's
   INDIA.cityLL holds 147 *mock* industrial cities (Chakan, Sanand,
   Oragadam ...) and will not cover the real ALIMCO plant cities. The
   coordinates genuinely do not exist anywhere yet.

   STILL VALID AND WORTH KEEPING:
     - projLL() is verified correct (reproduces INDIA.cityXY exactly).
     - Keying on WERKS, not city name, is the right pattern:
       ZSD_ZONE_PLANT.remarks is free text (zsd_unit), unsafe to match on.
     - plantDots() is fine — it only needs a fuller coordinate source.

   PREFERRED REPLACEMENT (see AD-5 in CONTEXT_LOG.md):
     One dot per STATE at INDIA.cent[state], sized by that state's value.
     All 36 centroids already ship in the template, so it needs zero new
     geo data — and with 109 plants, per-plant dots would overlap into an
     unreadable blob anyway.

   Retained as a reference implementation of the projection wiring.
   Confirm plant counts via Phase 0 task P0-0 before reworking.
   =====================================================================

   PLANT_GEO — plant code -> map coordinates for the India choropleth dots
   =====================================================================
   Keyed on WERKS (stable) rather than city name, because
   ZSD_ZONE_PLANT.remarks is free-text (zsd_unit) and any spelling or
   spacing variant would silently drop a dot off the map.

   lat/lon are real geographic coordinates. Feed them to the template's
   existing projLL(lat, lon) helper to get SVG x/y — do NOT hard-code the
   xy values; they are listed here only as an expected-output cross-check.

   Verification (2026-08-12): every point below was projected with the
   template's own projection constants and point-in-polygon tested against
   INDIA.paths. All 10 land inside their stated state and inside no other.

   Provenance:
     - 7 cities (Kanpur, Bengaluru, Bhubaneswar, Mohali, Faridabad,
       Kolkata, Hyderabad) were already present in INDIA.cityLL and their
       projections match INDIA.cityXY exactly.
     - 3 cities (Jabalpur, Ujjain, Mumbai) were absent from cityLL and
       were added here from real coordinates, then polygon-verified.
   ===================================================================== */
const PLANT_GEO = {
  // werks      lat        lon       city           zone      expected SVG xy
  '2000': { lat: 26.45,   lon: 80.33,   city: 'Kanpur',      zone: 'CENTRAL' }, // (320.1, 319.1)
  '3100': { lat: 23.1815, lon: 79.9864, city: 'Jabalpur',    zone: 'CENTRAL' }, // (311.5, 408.5)  ADDED
  '3200': { lat: 12.97,   lon: 77.59,   city: 'Bengaluru',   zone: 'SOUTH'   }, // (252.0, 675.6)
  '3300': { lat: 23.1765, lon: 75.7885, city: 'Ujjain',      zone: 'WEST'    }, // (207.3, 408.6)  ADDED
  '3400': { lat: 20.30,   lon: 85.82,   city: 'Bhubaneswar', zone: 'EAST'    }, // (456.4, 485.5)
  '3500': { lat: 30.70,   lon: 76.72,   city: 'Mohali',      zone: 'NORTH'   }, // (230.4, 198.9)
  '3600': { lat: 28.41,   lon: 77.31,   city: 'Faridabad',   zone: 'NORTH'   }, // (245.1, 264.3)
  '4200': { lat: 22.57,   lon: 88.36,   city: 'Kolkata',     zone: 'EAST'    }, // (519.4, 425.0)
  '4300': { lat: 17.39,   lon: 78.49,   city: 'Hyderabad',   zone: 'SOUTH'   }, // (274.4, 561.9)
  '4500': { lat: 19.076,  lon: 72.8777, city: 'Mumbai',      zone: 'WEST'    }  // (135.1, 517.8)
};

/* NOT YET MAPPED — these 5 plants exist in ZSD_CAT_PLANT but have no
   ZSD_ZONE_PLANT row at all (no zone, no city), so there is nothing to
   derive coordinates from. If they come into scope, the master data gap
   has to be closed first — it is a business question, not a code fix.
     4100, 4400, 4600, 4700, 4800
   Guard for it rather than crashing: see plantDots() below. */

/* ---------------------------------------------------------------------
   Usage — replaces the template's PLANTS.map(...) dot block (~line 785).
   `rows` is whatever ZSD_PMS_PLANT returned: [{ Werks, NetValue }, ...]
   --------------------------------------------------------------------- */
function plantDots(rows, projLL, opts) {
  const o = opts || {};
  const selected = o.selected || new Set();
  const maxv = Math.max.apply(null, rows.map(r => r.NetValue).concat([1]));
  const unmapped = [];

  const svg = rows
    .filter(r => r.NetValue > 0)
    .sort((a, b) => b.NetValue - a.NetValue)   // big dots first, small on top
    .map(r => {
      const g = PLANT_GEO[r.Werks];
      if (!g) { unmapped.push(r.Werks); return ''; }   // never crash on new plants
      const xy = projLL(g.lat, g.lon);
      const rad = (2.2 + Math.sqrt(r.NetValue / maxv) * 6.5).toFixed(1);
      const sel = selected.has(r.Werks);
      return '<circle class="plant" data-p="' + r.Werks + '"'
           + ' cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + rad + '"'
           + ' fill="' + (o.color || '#E4162A') + '"'
           + ' fill-opacity="' + (sel ? 0.95 : 0.66) + '"'
           + ' stroke="#fff" stroke-width="' + (sel ? 2 : 0.9) + '"></circle>';
    })
    .join('');

  if (unmapped.length) {
    console.warn('PLANT_GEO: no coordinates for plant(s) ' + unmapped.join(', ')
               + ' — dot omitted. Add them to PLANT_GEO.');
  }
  return '<g id="dots">' + svg + '</g>';
}
