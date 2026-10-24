"""The pilot catalogue: one recycling point, three drinks, and what the server does with places it no longer knows.

The supplied values are written out here on purpose, independently of the app's own data file, so a typo in either
place fails a test. The browser-side checks (tests/js/catalogue.test.js) compare the app's data with these files.
"""
import json
import re

from conftest import ROOT, STATION, E, code_of

STATIONS = json.loads((ROOT / 'server' / 'data' / 'stations.json').read_text(encoding='utf-8'))
RETIRED = json.loads((ROOT / 'server' / 'data' / 'retired_stations.json').read_text(encoding='utf-8'))
DRINKS = {'90162909': 'Red Bull', '7610097135078': 'Focus Water Reload', '7640127851166': 'Limonade Minze Bio'}


def ean_ok(code: str) -> bool:
    digits = [int(c) for c in code]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits[:-1])))
    return (10 - total % 10) % 10 == digits[-1]


def test_the_supplied_barcodes_are_valid_as_given():
    for code in DRINKS:
        assert re.fullmatch(r'\d{8}|\d{13}', code) and ean_ok(code), f'{code} fails its check digit'


def test_there_is_exactly_one_station_with_the_supplied_position_and_materials():
    assert len(STATIONS) == 1
    st = STATIONS[0]
    assert st['id'] == STATION == 'rotkreuz-pet-aluminium-point'
    assert (st['lat'], st['lng']) == (47.143376, 8.432881)
    assert sorted(st['materials']) == ['aluminium', 'pet']
    assert st['name'] == 'PET and aluminium recycling point' and st['source'] == 'team' and st['sample'] is False


def test_the_station_files_have_no_invented_details():
    assert set(STATIONS[0]) == {'id', 'name', 'lat', 'lng', 'materials', 'source', 'sample'}


def test_retired_ids_are_never_active():
    assert RETIRED and not ({s['id'] for s in STATIONS} & set(RETIRED))


def test_a_checkin_may_only_use_materials_the_station_accepts(demo):
    p = demo.person()
    assert code_of(demo.checkin, p, [E('glass', 2)]) == 'material_not_accepted'
    assert demo.svc.state(p.user)['activities'] == []
    assert demo.checkin(p, [E('pet', 2)])['status'] == 'counted'


def test_a_checkin_at_a_retired_station_is_refused_with_a_clear_code(world):
    p = world.person()
    assert code_of(world.checkin, p, [E('pet', 2)], station=RETIRED[0]) == 'retired_station'
    assert world.balance(p) == 0


def test_a_plain_log_that_mentions_a_retired_station_still_counts(world):
    p = world.person()
    out = world.log(p, [E('glass', 2)], stationId=RETIRED[3])
    assert out['status'] == 'counted' and out['stationId'] is None and world.balance(p) == 10


def test_a_non_text_station_id_is_refused(demo):
    p = demo.person()
    assert code_of(demo.log, p, [E('pet', 2)], stationId=['x']) == 'unknown_station'
