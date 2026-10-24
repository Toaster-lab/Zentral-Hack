import json, urllib.request, urllib.parse, time, datetime
q = '[out:json][timeout:25];(node["amenity"="recycling"](47.125,8.405,47.160,8.455);node["amenity"="waste_basket"](47.130,8.415,47.152,8.445););out;'
data = urllib.parse.urlencode({'data': q}).encode()
for i in range(4):
    try:
        req = urllib.request.Request('https://overpass-api.de/api/interpreter', data=data, headers={'User-Agent':'RECYCL IT!-demo/0.1'})
        d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode('utf-8'))
        break
    except Exception as e:
        print('retry', e); time.sleep(8)
out = []
for e in d['elements']:
    t = e.get('tags', {})
    out.append({'osm': e['type'][0] + str(e['id']), 'lat': e['lat'], 'lon': e['lon'], 'tags': t})
json.dump({'fetched': datetime.date.today().isoformat(), 'elements': out}, open('osm_rotkreuz.json','w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out)); print([o for o in out if o['tags'].get('amenity')=='recycling'])
lats=[o['lat'] for o in out]; lons=[o['lon'] for o in out]
print(min(lats),max(lats),min(lons),max(lons))
