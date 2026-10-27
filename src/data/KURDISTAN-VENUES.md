# Kurdistan venue suggestions

Snapshot: 2026-09-25. Source: OpenStreetMap, via the documented VK Maps
Overpass endpoint https://maps.mail.ru/osm/tools/overpass/api/interpreter.
Attribution: © OpenStreetMap contributors, ODbL 1.0:
https://www.openstreetmap.org/copyright

The JSON contains the exact extraction query and a source URL per record.
The extraction covers OSM areas with ISO3166-2 codes IQ-AR, IQ-DA, IQ-SU,
IQ-HA (Erbil, Duhok, Sulaymaniyah, Halabja).

Counts:
- 1,331 mapped pitch/stadium/sports-centre elements (not unique facilities).
- 240 elements with a name.
- 187 suggestions after filtering and nearby same-name deduplication.

All named pitches and stadiums were retained. Sports centres were retained
only when tags identify court sports/multi-sport or names identify a playing
ground. Resort and fitness-only entries are not used as court recommendations.
Same-name entries within 0.001 degrees were treated as duplicates; this is a
heuristic, not an ownership or facility-boundary determination.

Only 26 records have an explicit city tag. Missing cities and street addresses
are deliberately left empty for the host to complete. Coordinates on ways are
bounding-box centres, not surveyed entrance locations. Hosts must check the pin.
Localized names/aliases are source data; untranslated names are not invented.
Some records may be obsolete, private, non-rentable, or incorrectly mapped.
This is NOT a census, verified inventory, booking availability, or proof of
ownership. Suggestions only fill a draft and do not publish listings.

The client searches this snapshot locally; typing never calls Overpass or
Nominatim. A refresh must be a deliberate offline extraction, followed by
validation and rebuilding the snapshot. Do not replace this with per-keystroke
calls to a shared public endpoint. Update counts and extraction date on refresh.
