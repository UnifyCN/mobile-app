import * as fs from 'fs';
import * as path from 'path';
import {
  buildMutations,
  planChanges,
  validatePayload,
  verifyReadback,
  type ChecklistRecord,
  type Payload,
} from '../../scripts/sanity-before-you-land/content';

const CONTENT_DIR = path.resolve(
  __dirname,
  '../../content/sanity/before-you-land'
);

function loadPayload(): Payload {
  return JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'payload.json'), 'utf8')
  );
}

function withCreate(change: Partial<ChecklistRecord>): Payload {
  const payload = loadPayload();
  payload.create[0] = { ...payload.create[0], ...change };
  return payload;
}

describe('validatePayload', () => {
  it('rejects province wording in a new record', () => {
    const errors = validatePayload(
      withCreate({
        description: 'Why: BC health coverage has a three month wait.',
      })
    );
    expect(errors.join('\n')).toMatch(/province/i);
  });

  it('rejects a class that the live schema does not allow', () => {
    const errors = validatePayload(withCreate({ class: 'do_later' }));
    expect(errors.join('\n')).toMatch(/class/);
  });

  it('rejects an em dash in new copy', () => {
    const errors = validatePayload(
      withCreate({ title: 'Gather documents \u2014 and keep copies' })
    );
    expect(errors.join('\n')).toMatch(/em dash/i);
  });

  it('rejects a record that is not an English not_arrived checklist item', () => {
    const errors = validatePayload(
      withCreate({ language: 'fr-CA', stage: 'months_3_12' })
    );
    expect(errors.join('\n')).toMatch(/language/);
    expect(errors.join('\n')).toMatch(/stage/);
  });

  it('rejects a persona that no app persona or live record uses', () => {
    const errors = validatePayload(withCreate({ personas: ['tourist'] }));
    expect(errors.join('\n')).toMatch(/persona/);
  });

  it('accepts exactly the six persona values of the live checklist schema', () => {
    const live = [
      'international_student',
      'refugee',
      'protected_person',
      'skilled_worker',
      'immigrant',
      'pr',
    ];
    for (const persona of live) {
      expect(validatePayload(withCreate({ personas: [persona] }))).toEqual([]);
    }
    expect(validatePayload(withCreate({ personas: live }))).toEqual([]);
  });

  it('rejects the persona other, which the live schema refuses as value.not-allowed', () => {
    const errors = validatePayload(
      withCreate({ personas: ['refugee', 'other'] })
    );
    expect(errors.join('\n')).toMatch(/persona "other"/);
  });

  it('rejects a link_tab outside the schema list and a record with no link', () => {
    expect(
      validatePayload(withCreate({ link_tab: 'settings' })).join('\n')
    ).toMatch(/link_tab/);
    expect(
      validatePayload(withCreate({ link_tab: undefined })).join('\n')
    ).toMatch(/link/);
  });

  it('accepts the committed payload and keeps its targeting', () => {
    const payload = loadPayload();
    expect(validatePayload(payload)).toEqual([]);
    const refugee = payload.create.filter(
      r => r.personas.length === 1 && r.personas[0] === 'refugee'
    );
    expect(refugee).toHaveLength(4);
    expect(refugee.map(r => r.class).sort()).toEqual([
      'do_now',
      'do_now',
      'do_soon',
      'explore_and_connect',
    ]);
    const pet = payload.create.filter(r => /dog or cat/.test(r.title));
    expect(pet).toHaveLength(1);
    expect(pet[0].description).toContain(
      'https://inspection.canada.ca/en/importing-food-plants-animals/pets'
    );
    expect(payload.create).toHaveLength(5);
    expect(payload.patch).toHaveLength(1);
  });
});

describe('shared pet record targeting', () => {
  it('targets the six live-schema personas, including protected_person and excluding other', () => {
    const pet = loadPayload().create.find(r => /dog or cat/.test(r.title));
    expect([...(pet?.personas ?? [])].sort()).toEqual(
      [
        'immigrant',
        'international_student',
        'pr',
        'protected_person',
        'refugee',
        'skilled_worker',
      ].sort()
    );
    expect(pet?.personas).not.toContain('other');
  });
});

describe('source-backed wording', () => {
  const payload = loadPayload();
  const port = payload.patch[0].set;
  const health = payload.create.find(r => /Interim Federal/.test(r.title))!;

  it('port item lists proof of settlement funds with the exemption, and keeps COPR and goods-list steps', () => {
    const text = port.description;
    expect(text).toMatch(/proof of settlement funds \(unless you are exempt\)/);
    expect(text).toContain('your COPR');
    expect(text).toContain('passport');
    expect(text).toContain('permanent resident visa (if you have one)');
    expect(text).toContain('two copies of a list of the goods');
    expect(text).toContain('Valid to date');
    expect(port.description.length).toBeLessThanOrEqual(450);
  });

  it('health item limits IFHP basic coverage to the interval before provincial coverage', () => {
    const text = health.description;
    expect(text).toMatch(/basic (health care|coverage)/i);
    expect(text).toMatch(/until you qualify for provincial or territorial/i);
    expect(text).toMatch(
      /apply for provincial or territorial health insurance/i
    );
  });

  it('health item separates the longer supplemental and prescription benefits', () => {
    const text = health.description;
    expect(text).toMatch(/supplemental and prescription/i);
    expect(text).toMatch(
      /resettlement (income support|assistance)|sponsorship/i
    );
    expect(text).not.toMatch(/IFHP[^.]*(ends|stops) when provincial/i);
  });

  it('health item names an IFHP-registered provider and keeps the officer certificate', () => {
    const text = health.description;
    expect(text).toMatch(/registered with the (IFHP|Interim Federal)/);
    expect(text).toContain('IFHP certificate');
    expect(health.title).not.toMatch(/first, then provincial/);
  });
});

describe('planChanges for new records', () => {
  it('creates records that are absent and leaves identical live records alone', () => {
    const payload = loadPayload();
    const [first, second] = payload.create;
    const live = {
      [first._id]: {
        ...first,
        _rev: 'abc',
        _createdAt: '2026-10-24T00:00:00Z',
        _updatedAt: '2026-10-24T00:00:00Z',
      },
    };
    const actions = planChanges(payload, live);
    expect(actions.find(a => a.id === first._id)?.kind).toBe('noop');
    expect(actions.find(a => a.id === second._id)?.kind).toBe('create');
  });

  it('never overwrites a live record that differs from the payload', () => {
    const payload = loadPayload();
    const first = payload.create[0];
    const live = {
      [first._id]: { ...first, _rev: 'abc', title: 'Edited in Studio' },
    };
    const action = planChanges(payload, live).find(a => a.id === first._id);
    expect(action?.kind).toBe('conflict');
  });
});

describe('planChanges for the existing port-of-entry record', () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'snapshot-before.json'), 'utf8')
  );
  const before = snapshot.portOfEntryRecord;
  const livePorts = (doc: Record<string, unknown> | null) => {
    const payload = loadPayload();
    const id = payload.patch[0]._id;
    const found = planChanges(payload, doc ? { [id]: doc as never } : {}).find(
      a => a.id === id
    );
    return { payload, found };
  };

  it('patches only title and description, guarded by the snapshot revision', () => {
    const { payload, found } = livePorts(before);
    expect(found?.kind).toBe('patch');
    expect(found?.ifRevisionID).toBe(before._rev);
    expect(found?.set).toEqual(payload.patch[0].set);
    expect(Object.keys(found?.set ?? {}).sort()).toEqual([
      'description',
      'title',
    ]);
  });

  it('refuses to patch when the live revision moved and the copy is not the target', () => {
    const { found } = livePorts({
      ...before,
      _rev: 'someoneElseEdited',
      title: 'Edited in Studio',
    });
    expect(found?.kind).toBe('conflict');
  });

  it('does nothing when the live record already holds the target copy', () => {
    const payload = loadPayload();
    const { found } = livePorts({
      ...before,
      _rev: 'afterOurApply',
      ...payload.patch[0].set,
    });
    expect(found?.kind).toBe('noop');
  });

  it('reports a conflict when the record is missing', () => {
    expect(livePorts(null).found?.kind).toBe('conflict');
  });
});

describe('verifyReadback', () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(CONTENT_DIR, 'snapshot-before.json'), 'utf8')
  );
  const before = snapshot.portOfEntryRecord;

  function liveAfterApply() {
    const payload = loadPayload();
    const live: Record<string, Record<string, unknown>> = {};
    for (const record of payload.create) {
      live[record._id] = { ...record, _rev: 'r1', _updatedAt: 'now' };
    }
    live[before._id] = { ...before, ...payload.patch[0].set, _rev: 'r2' };
    return { payload, live };
  }

  it('passes when every record reads back exactly as proposed', () => {
    const { payload, live } = liveAfterApply();
    expect(verifyReadback(payload, live as never, before)).toEqual([]);
  });

  it('reports a missing new record and a changed new record', () => {
    const { payload, live } = liveAfterApply();
    const [a, b] = payload.create;
    delete live[a._id];
    live[b._id] = { ...live[b._id], description: 'Why: edited' };
    const errors = verifyReadback(payload, live as never, before).join('\n');
    expect(errors).toContain(a._id);
    expect(errors).toContain(b._id);
  });

  it('reports a change to a field the patch must not touch', () => {
    const { payload, live } = liveAfterApply();
    live[before._id] = { ...live[before._id], personas: ['pr'] };
    const errors = verifyReadback(payload, live as never, before).join('\n');
    expect(errors).toContain(before._id);
    expect(errors).toMatch(/personas/);
  });
});

describe('buildMutations', () => {
  it('writes only what the plan needs, with the revision guard on the patch', () => {
    const payload = loadPayload();
    const snapshot = JSON.parse(
      fs.readFileSync(path.join(CONTENT_DIR, 'snapshot-before.json'), 'utf8')
    );
    const portId = payload.patch[0]._id;
    const plan = planChanges(payload, {
      [portId]: snapshot.portOfEntryRecord,
    });
    const mutations = buildMutations(payload, plan);
    expect(mutations).toHaveLength(6);
    const creates = mutations.filter(m => 'createIfNotExists' in m);
    expect(creates).toHaveLength(5);
    expect(
      mutations.filter(m => 'create' in m || 'createOrReplace' in m)
    ).toEqual([]);
    expect(mutations.find(m => 'patch' in m)).toEqual({
      patch: {
        id: portId,
        ifRevisionID: snapshot.portOfEntryRecord._rev,
        set: payload.patch[0].set,
      },
    });
  });

  it('writes nothing when the live data already matches', () => {
    const payload = loadPayload();
    const live: Record<string, Record<string, unknown>> = {};
    for (const r of payload.create) live[r._id] = { ...r, _rev: 'x' };
    live[payload.patch[0]._id] = {
      _id: payload.patch[0]._id,
      _rev: 'y',
      ...payload.patch[0].set,
    };
    expect(
      buildMutations(payload, planChanges(payload, live as never))
    ).toEqual([]);
  });
});
