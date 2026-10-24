"""The Migros import boundary: strict, local, and empty until a permitted official export is supplied."""
import json
import sys

import pytest

from conftest import FIXTURES, ROOT

sys.path.insert(0, str(ROOT / 'tools'))
import import_migros  # noqa: E402

CASES = json.loads((FIXTURES / 'migros_import_cases.json').read_text(encoding='utf-8'))


@pytest.mark.parametrize('case', CASES['cases'], ids=[c['name'] for c in CASES['cases']])
def test_the_validator_follows_the_shared_cases(case):
    records, _ = import_migros.validate(case['import'], CASES['approved'], CASES['today'])
    assert {b: sorted(r['fields']) for b, r in records.items()} == {b: sorted(f) for b, f in case['expect'].items()}


def test_the_approved_list_is_read_from_the_apps_catalogue():
    assert import_migros.approved_barcodes() == CASES['approved']


def test_the_shipped_import_is_empty_because_no_migros_source_is_connected():
    js = (ROOT / 'js' / 'data' / 'migros-import.js').read_text(encoding='utf-8')
    assert 'source: null' in js and 'records: {}' in js


def test_the_tool_reads_a_local_file_and_never_touches_the_network():
    src = (ROOT / 'tools' / 'import_migros.py').read_text(encoding='utf-8')
    for banned in ('urllib.request', 'http.client', 'import socket', 'import requests', 'urlopen'):
        assert banned not in src


def test_a_valid_export_is_written_with_its_provenance(tmp_path):
    export = tmp_path / 'export.json'
    export.write_text(json.dumps(CASES['cases'][0]['import']), encoding='utf-8')
    out = tmp_path / 'migros-import.js'
    assert import_migros.main([str(export), '--out', str(out), '--today', CASES['today']]) == 0
    text = out.read_text(encoding='utf-8')
    assert 'https://www.migros.ch/example-export' in text and '"retrievedAt": "2026-10-20"' in text and '"priceChf": 1.2' in text


def test_a_problem_stops_the_run_and_writes_nothing(tmp_path):
    bad = json.loads(json.dumps(CASES['cases'][1]['import']))      # one approved and one unapproved barcode
    export = tmp_path / 'export.json'
    export.write_text(json.dumps(bad), encoding='utf-8')
    out = tmp_path / 'migros-import.js'
    assert import_migros.main([str(export), '--out', str(out), '--today', CASES['today']]) == 1 and not out.exists()
    assert import_migros.main([str(export), '--out', str(out), '--today', CASES['today'], '--drop-invalid']) == 0 and out.exists()
    assert '7610097135079' not in out.read_text(encoding='utf-8')


def test_an_untrusted_source_writes_nothing(tmp_path):
    export = tmp_path / 'export.json'
    export.write_text(json.dumps(CASES['cases'][2]['import']), encoding='utf-8')
    out = tmp_path / 'migros-import.js'
    assert import_migros.main([str(export), '--out', str(out), '--today', CASES['today']]) == 1 and not out.exists()
