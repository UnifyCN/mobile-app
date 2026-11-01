from pathlib import Path
import copy, gzip, hashlib, json, subprocess
import yaml
from jsonschema import Draft202012Validator

E = Path(__file__).resolve().parent
repo = E.parents[3]
base = '91dd836ce3f7ea19b8d2e257a9dbdf612cc662e4'
schema_bytes = gzip.decompress((E / 'schema.v2.json.gz').read_bytes())
fetch = json.loads((E / 'schema-fetch.json').read_text())
assert hashlib.sha256(schema_bytes).hexdigest() == fetch['sha256']
schema = json.loads(schema_bytes)
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
original = yaml.safe_load(subprocess.check_output(['git', '-C', str(repo), 'show', base + ':.coderabbit.yaml'], text=True))
current = yaml.safe_load((repo / '.coderabbit.yaml').read_text())
old_errors = list(validator.iter_errors(original))
assert len(old_errors) == 1 and old_errors[0].validator == 'additionalProperties'
assert 'skip_files' in old_errors[0].message
assert not list(validator.iter_errors(current))
expected = copy.deepcopy(original)
patterns = expected.pop('skip_files')
expected['reviews']['path_filters'] = ['!' + item for item in patterns]
assert len(patterns) == 4 and current == expected
assert current['reviews']['auto_review']['drafts'] is False
assert not subprocess.check_output(['git', '-C', str(repo), 'diff', base, '--', 'unify-front-end'])
print(json.dumps({'base_rejects_unsupported_key': True, 'candidate_schema_valid': True, 'declared_exclusions_preserved': 4, 'all_other_settings_equal': True, 'draft_reviews_disabled': True, 'application_subtree_unchanged': True}, indent=2))
