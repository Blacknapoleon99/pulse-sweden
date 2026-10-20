"""Prepare retrospective draft references; this script never grants human approval.

Run from the repository root. Source strings (including line endings and dates)
are preserved exactly. Only derived candidate fields are normalized.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ['sourceId', 'title', 'area', 'level', 'levelLabel', 'publishedAt',
          'validFrom', 'validTo', 'sourceUrl', 'sourceText']


def main():
    with (ROOT / 'docs/foundry-public-alert-sample.csv').open(encoding='utf-8-sig', newline='') as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == 17 and len({r['sourceId'] for r in rows}) == 17
    references, output = [], []
    for r in rows:
        assert r['sourceUrl'].startswith('https://www.smhi.se/')
        assert r['publishedAt'] and r['fetchedAt'] and '\n' in r['sourceText']
        text = r['sourceText'].replace('\r\n', '\n')
        condition = text.split('\n\n')[0]
        gale = r['sourceId'] == '3343-10563'
        fire = r['sourceId'] == '3344-10566'
        if gale:
            forecast = condition
            advice = ['Förbered besättning och fartyg för mycket vind och sjö, och överväg om det är lämpligt att ge sig ut till sjöss.',
                      'Tänk på att byvinden ofta är betydligt högre än medelvinden.']
            event = f"SMHI {r['levelLabel']}: {r['title']} i {r['area']}."
        elif fire:
            forecast = ''
            advice = ['Kontrollera om eldningsförbud råder i ditt område, och var mycket försiktig vid eldning eller arbete med stora maskiner utomhus.']
            event = f"SMHI {r['levelLabel']}: {r['title']} i {r['area']}. {condition} Brand kan lätt uppstå av eldning, maskingnistor eller blixtnedslag och sprids lätt. Brand i ledningsgator kan störa el- och telenät."
        else:
            forecast = ''
            advice = [line for line in text.split('\n') if line.startswith(('Du som ', 'Verksamheter och hushåll '))]
            compact = condition
            if condition.count(',') >= 3 or r['sourceId'] == '3181-10013':
                compact = 'Låga grundvattennivåer och låga flöden i flera vattendrag; se den fullständiga listan i källan.'
            event = f"SMHI {r['levelLabel']}: {r['title']} i {r['area']}. {compact}"
        source_hash = hashlib.sha256(json.dumps([r[k] for k in FIELDS], ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()
        facts = {'authority': 'SMHI', 'levelLabel': r['levelLabel'], 'area': r['area'],
                 'conditions_verbatim': condition, 'advice_verbatim': advice,
                 'forecastDetails': forecast, 'forecast_must_be_empty': not gale,
                 'metadata_copy_only': {k:r[k] for k in ['sourceId','sourceUrl','publishedAt','validFrom','validTo','fetchedAt']}}
        references.append({**r, 'contentVersion': source_hash, 'candidate_event_summary': event,
                           'candidate_advice_groups_json': json.dumps(advice, ensure_ascii=False),
                           'candidate_forecast_details': forecast,
                           'expected_facts_json': json.dumps(facts, ensure_ascii=False),
                           'human_event_summary':'', 'human_advice_groups_json':'', 'human_forecast_details':'',
                           'review_status':'pending', 'reviewer':'', 'reviewed_at':'',
                           'review_notes':'Assistant-prepared draft; requires source comparison and human approval.'})
        # Empty approved-text/model fields intentionally cannot satisfy the serving contract.
        output.append({'sourceId':r['sourceId'], 'contentVersion':source_hash, 'summarySv':'',
                       'sourceUrl':r['sourceUrl'], 'sourceUpdatedAt':r['publishedAt'],
                       'sourceFetchedAt':r['fetchedAt'], 'generatedAt':'', 'modelVersion':'',
                       'reviewStatus':'pending', 'sourcePublishedAt':r['publishedAt'],
                       'sourceValidFrom':r['validFrom'], 'sourceValidTo':r['validTo']})
    for name, data in [('foundry-review-queue.csv',references),('foundry-reviewed-output.csv',output)]:
        with (ROOT/'docs'/name).open('w',encoding='utf-8',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=list(data[0]));writer.writeheader();writer.writerows(data)
    (ROOT/'docs/foundry-reference-drafts.json').write_text(json.dumps(references,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Prepared 17 pending reference drafts and 17 pending output placeholders; approved rows: 0.')


if __name__ == '__main__':
    main()
