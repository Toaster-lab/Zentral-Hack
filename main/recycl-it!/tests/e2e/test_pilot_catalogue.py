"""The pilot catalogue as a person sees it: three drinks, one recycling point, nothing else coming back from old data."""
import json
import re
import urllib.request

from playwright.sync_api import expect

from conftest import NEAR
from helpers import dialog

DRINKS = {'90162909': 'Red Bull', '7610097135078': 'Focus Water Reload', '7640127851166': 'Limonade Minze Bio'}


def scan(page, app, code):
    page.goto(app.url + '#/home')                                           # a fresh Scan screen each time
    page.goto(app.url + '#/scan')
    page.get_by_placeholder('e.g. 90162909').fill(code)
    page.get_by_role('button', name='Look it up').click()


def test_scan_finds_each_drink_even_with_spaces_and_says_where_the_details_come_from(make_page, local_app):
    page = make_page()
    for code, name in [('9016 2909', 'Red Bull'), ('7610097135078', 'Focus Water Reload'), ('7640 1278 51166', 'Limonade Minze Bio')]:
        scan(page, local_app, code)
        expect(page.get_by_role('heading', name=name)).to_be_visible()
        expect(page.get_by_text('Product details supplied by the team')).to_be_visible()
    expect(page.get_by_text('Source: Migros')).to_have_count(0)           # nothing here came from Migros
    assert page.errors == []


def test_scan_suggestions_lead_with_the_three_drinks_and_examples_are_behind_a_toggle(make_page, local_app):
    page = make_page()
    page.goto(local_app.url + '#/scan')
    codes = page.locator('.demo-code .mono').all_inner_texts()
    assert sorted(codes) == sorted(DRINKS)
    page.get_by_role('button', name=re.compile('more example barcodes')).click()
    assert page.locator('.demo-code').count() == 102


def test_an_unknown_or_mistyped_barcode_gets_a_clear_message_and_no_outside_lookup(make_page, local_app):
    page = make_page()
    outside = []
    page.on('request', lambda r: outside.append(r.url) if not r.url.startswith(local_app.url) else None)
    scan(page, local_app, '4006381333931')
    expect(page.get_by_text('Not in this pilot catalogue')).to_be_visible()
    expect(page.get_by_role('button', name='Add this barcode')).to_have_count(0)
    scan(page, local_app, '90162908')                                       # wrong check digit: reported, not "fixed"
    expect(page.get_by_role('alert')).to_contain_text('doesn’t look quite right')
    expect(page.get_by_role('heading', name='Red Bull')).to_have_count(0)
    assert outside == []


def test_discover_labels_example_products_and_team_drinks_honestly(make_page, local_app):
    page = make_page()
    page.goto(local_app.url + '#/discover')
    page.get_by_placeholder('For example').fill('Red Bull')
    page.get_by_role('button', name='Search').click()
    row = page.locator('.product-row').filter(has=page.get_by_role('heading', name='Red Bull', exact=True)).filter(has_text='250 ml')
    expect(row).to_have_count(1)
    expect(row).to_contain_text('Red Bull')
    expect(row).to_contain_text('250 ml')
    for text in ('CHF 2.20', 'Diet: Vegan', 'Certifications: not available', 'Product details supplied by the team', 'not from Migros'):
        expect(row).to_contain_text(text)
    page.get_by_placeholder('For example').fill('Cola')
    page.get_by_role('button', name='Search').click()
    expect(page.locator('.product-row').first).to_contain_text('Migros (example)')
    expect(page.locator('.product-row').first).to_contain_text('Example data, not from Migros')
    expect(page.get_by_text('Source: Migros')).to_have_count(0)
    page.get_by_placeholder('For example').fill('pizza')
    page.get_by_role('button', name='Search').click()
    expect(page.get_by_text('Not in this pilot catalogue')).to_be_visible()


def test_map_shows_one_recycling_point_and_filters_are_honest(make_page, local_app):
    page = make_page()
    page.goto(local_app.url + '#/map')
    page.get_by_role('tab', name='List').click()
    expect(page.locator('.place-row')).to_have_count(1)
    expect(page.locator('.place-row')).to_contain_text('PET and aluminium recycling point')
    expect(page.get_by_text('1 station')).to_be_visible()
    expect(page.get_by_role('button', name='Add a place')).to_have_count(0)      # the pilot map cannot grow
    page.get_by_role('button', name='Glass', exact=True).click()
    expect(page.get_by_text('Nothing to show here')).to_be_visible()
    expect(page.get_by_text('No place matches these filters')).to_contain_text('accepts PET drink bottles and aluminium')
    page.get_by_role('button', name='Glass', exact=True).click()
    for material in ('PET drink bottles', 'Aluminium'):
        page.get_by_role('button', name=material, exact=True).click()
        expect(page.locator('.place-row')).to_have_count(1)
        page.get_by_role('button', name=material, exact=True).click()
    page.locator('.place-row').click()
    sheet = page.get_by_role('dialog')
    expect(sheet).to_contain_text('Supplied by the team')
    expect(sheet).to_contain_text('Not officially verified')
    expect(sheet.get_by_role('button', name='Suggest a correction')).to_have_count(0)


def test_the_check_in_selector_offers_exactly_that_station(make_page, local_app):
    page = make_page(location=NEAR)
    page.goto(local_app.url)
    page.get_by_role('button', name='Check in at a station').click()
    d = dialog(page, 'Check in')
    expect(d.get_by_role('button', name=re.compile('recycling point'))).to_have_count(1)
    expect(d.get_by_role('button', name=re.compile('PET and aluminium recycling point'))).to_have_count(1)


def test_old_stored_data_neither_brings_back_old_places_and_products_nor_loses_activity(make_page, local_app):
    page = make_page()
    page.goto(local_app.url + '/offline.html')      # a same-origin page that runs no app code, so nothing overwrites what is stored next
    old_state = {
        'profile': {'nickname': 'Mia', 'municipality': 'risch', 'weeklyGoal': 20, 'leaderboardOptIn': False, 'useOpenFoodFacts': True, 'welcomeDismissed': True},
        'activities': [{'id': 'a1', 'batchId': 'b1', 'ts': 1_700_000_000_000, 'material': 'glass', 'count': 3, 'accepted': 3, 'verification': 'self-reported', 'stationId': 'demo-glass-can', 'source': 'checkin', 'evidence': 'self'}],
        'ledger': [{'id': 'l1', 'ts': 1_700_000_000_000, 'points': 321, 'label': 'Recycled 3 x glass', 'type': 'earn'}],
        'customProducts': {'4006381333931': {'barcode': '4006381333931', 'name': 'Pencil case', 'components': [{'part': 'Case', 'material': 'mixed_plastic'}], 'collect': [], 'createdAt': 1}},
        'checkins': [],
    }
    old_community = {'version': 1, 'items': [{'id': 'demo-sub-1', 'demo': True, 'kind': 'new_place', 'status': 'pending', 'areaId': 'rotkreuz', 'contributorId': 'demo-member-1', 'createdAt': 1, 'payload': {'type': 'bin', 'name': 'Old sample bin', 'lat': 47.1427, 'lng': 8.4349, 'materials': []}}],
                     'confirmations': [], 'overrides': {}, 'created': [{'id': 'c-old', 'areaId': 'rotkreuz', 'type': 'station', 'name': 'Old approved place', 'lat': 47.1425, 'lng': 8.4312, 'materials': ['glass'], 'materialsKnown': True, 'hours': None, 'hoursText': '', 'access': '', 'description': '', 'photo': None, 'source': 'community', 'sample': False, 'approvedAt': 1}]}
    page.evaluate("([a, b]) => { localStorage.setItem('bubblecycle:v1', JSON.stringify(a)); localStorage.setItem('bubblecycle:community-demo:v1', JSON.stringify(b)); }", [old_state, old_community])
    page.goto(local_app.url + '/#/map')
    page.get_by_role('tab', name='List').click()
    expect(page.locator('.place-row')).to_have_count(1)
    expect(page.get_by_text('Old approved place')).to_have_count(0)
    page.goto(local_app.url + '#/rewards')
    assert int(page.locator('.points-block .stat').inner_text()) == 321      # points survived
    page.goto(local_app.url + '#/scan')
    expect(page.get_by_text('Pencil case')).to_have_count(0)                  # an old own barcode is kept but never served
    page.get_by_placeholder('e.g. 90162909').fill('4006381333931')
    page.get_by_role('button', name='Look it up').click()
    expect(page.get_by_text('Not in this pilot catalogue')).to_be_visible()
    kept = page.evaluate("JSON.parse(localStorage.getItem('bubblecycle:v1'))")
    assert kept['customProducts'] and kept['activities'][0]['stationId'] == 'demo-glass-can' and kept['catalogueVersion'] == 'drinks-2'
    assert page.errors == []


def test_the_offline_cache_lists_no_retired_data_files(local_app):
    manifest = urllib.request.urlopen(local_app.url + '/sw-manifest.js').read().decode()
    files = json.loads(re.search(r'BC_PRECACHE = (\{.*\});', manifest).group(1))['files']
    assert 'js/data/catalogue.js' in files
    assert not [f for f in files if 'osm-rotkreuz' in f or 'openfoodfacts' in f or 'addbarcode' in f]
