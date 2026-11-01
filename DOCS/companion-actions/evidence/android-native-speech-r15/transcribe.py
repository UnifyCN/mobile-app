from pathlib import Path
import json,sys,mlx_whisper
E=Path(__file__).resolve().parent
model='/Users/savargupta/.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/snapshots/a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb'
for label in sys.argv[1:]:
 target=E/(label+'-transcript.json');assert not target.exists()
 result=mlx_whisper.transcribe(str(E/'raw'/(label+'.wav')),path_or_hf_repo=model,language='en',temperature=0,condition_on_previous_text=False,verbose=False)
 target.write_text(json.dumps(result,indent=2)+'\n');print(label, result['text'],flush=True)
