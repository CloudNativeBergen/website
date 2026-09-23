#!/bin/zsh
# usage: runb.sh <App name> <label> <query>
app=$1; label=$2; q=$3
rm -f out/$label.json
open -a "$app" "http://127.0.0.1:4817/?auto=1&label=$label&$q"
for i in $(seq 1 90); do [ -f out/$label.json ] && break; /bin/sleep 1; done
[ -f out/$label.json ] && python3 -c "
import json;d=json.load(open('out/$label.json'));r=d.get('result');print('$label', json.dumps(r)[:400]); print([e['msg']+' '+json.dumps(e.get('data'))[:250] for e in d['events'] if any(k in e['msg'] for k in ['ERROR','error','rejection','priming','config','cancel'])])" || echo "$label TIMEOUT"
