"""Build the host suggestions and a full OSM inventory from a saved Overpass response.
Usage: python3 scripts/build-venue-directory.py input.json output-directory
Input query is recorded in the generated metadata. No venues are published by this script.
"""
import json, sys
from pathlib import Path
from datetime import date
from collections import Counter
root = Path(__file__).resolve().parents[1]
raw = json.loads(Path(sys.argv[1]).read_text())
if raw.get('remark') or not raw.get('elements'):
    raise SystemExit('Incomplete or empty Overpass response; refusing to replace the directory.')
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
query = '[out:json][timeout:45];area["ISO3166-2"~"^IQ-(AR|DA|SU|HA)$"]->.a;nwr(area.a)["leisure"~"^(pitch|stadium|sports_centre)$"];out center tags;'
metadata = dict(fetchedAt=date.today().isoformat(), source='OpenStreetMap via maps.mail.ru Overpass', license='ODbL-1.0', query=query, coverage='Mapped features in OSM administrative areas IQ-AR, IQ-DA, IQ-SU, IQ-HA. Not a complete census; locations, ownership and booking availability require verification.', osmTimestamp=raw.get('osm3s', {}).get('timestamp_osm_base'))
court_sports = {'soccer','football','futsal','basketball','tennis','padel','volleyball','badminton','handball','table_tennis','multi'}
features=[]; venues=[]; seen=set()
for e in raw['elements']:
    eid=f"{e['type']}/{e['id']}"
    if eid in seen: continue
    seen.add(eid)
    t=e.get('tags',{}); point=e.get('center',e)
    if 'lat' not in point or 'lon' not in point: continue
    name=t.get('name') or t.get('name:ckb') or t.get('name:en') or t.get('name:ar') or t.get('name:ku') or ''
    sports=set(t.get('sport','').split(';'))
    eligible = t.get('leisure')=='stadium' or (t.get('leisure')=='pitch' and (not t.get('sport') or bool(sports & court_sports))) or (t.get('leisure')=='sports_centre' and bool(sports & court_sports))
    record=dict(id=eid,name=name,aliases=list(dict.fromkeys(v for k,v in t.items() if k.startswith('name:') or k in ('alt_name','official_name','short_name'))), city=t.get('addr:city',''),region=t.get('addr:province') or t.get('addr:state') or 'Kurdistan Region',address=' '.join(filter(None,[t.get('addr:street'),t.get('addr:housenumber')])), latitude=point['lat'],longitude=point['lon'],sport=t.get('sport',''),kind=t.get('leisure',''),source=f'https://www.openstreetmap.org/{eid}', names=dict(en=t.get('name:en',''),ar=t.get('name:ar',''),ckb=t.get('name:ckb') or t.get('name:ku',''),kmr=t.get('name:kmr','')),verification='Map record only; not owner-verified or confirmed bookable')
    features.append(dict(type='Feature',geometry=dict(type='Point',coordinates=[point['lon'],point['lat']]),properties={**record,'tags':t,'hostSuggestion':bool(name and eligible)}))
    if name and eligible: venues.append(record)
venues.sort(key=lambda v:(v['names']['en'] or v['name']).casefold())
metadata.update(rawMappedFeatures=len(features),namedFeatures=sum(bool(f['properties']['name']) for f in features),hostSuggestions=len(venues))
(root/'src/data/kurdistan-venues.json').write_text(json.dumps({**metadata,'venues':venues},ensure_ascii=False,indent=2)+'\n')
(out/'kurdistan-sports-inventory.geojson').write_text(json.dumps(dict(type='FeatureCollection',metadata=metadata,features=features),ensure_ascii=False,indent=2)+'\n')
(out/'kurdistan-named-courts.json').write_text(json.dumps({**metadata,'venues':venues},ensure_ascii=False,indent=2)+'\n')
counts=Counter(f['properties']['kind'] for f in features)
(out/'venue-coverage.md').write_text(f'''# Kurdistan sports venue inventory

Refreshed {metadata['fetchedAt']} from OpenStreetMap. © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright).

- {len(features)} mapped features: {counts['stadium']} stadiums, {counts['pitch']} pitches and {counts['sports_centre']} sports centres.
- {metadata['namedFeatures']} features have a recorded name; {len(features)-metadata['namedFeatures']} do not.
- {len(venues)} named stadiums and court-related pitches/centres are included in host suggestions. Standalone pools, gyms, climbing and other non-court sports are kept in the full inventory, not the court picker.
- Coverage: OSM administrative areas IQ-AR (Erbil), IQ-DA (Duhok), IQ-SU (Sulaymaniyah), IQ-HA (Halabja).

This is **not a complete census of every venue**. Unmapped venues are absent. Multiple mapped objects can represent a complex and its individual pitches, so feature counts are not a count of unique businesses. Names and city fields may be missing or outdated. Point coordinates for ways and relations are geometry centres, not verified entrances.

Each record retains its OSM source URL, source names and tags. No prices, operating hours, ownership, rental access or photos were invented. Hosts must check the details before submitting a listing; none of these records has been published as a bookable court.

The GeoJSON contains the full mapped inventory, including unnamed facilities. The named JSON is the searchable shortlist used by the form. Both retain the query, date and data timestamp so the import can be reproduced.
''')
print(json.dumps(metadata,ensure_ascii=False))
