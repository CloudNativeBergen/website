#!/bin/zsh
P=/private/tmp/claude-501/-Users-oyr-projects-cndn-website/156d2ea2-3290-4d6c-b467-06dd8b737dd9/scratchpad/ff-prof
label=$1; q=$2
pkill -f "ff-prof"; /bin/sleep 2; rm -f $P/lock $P/.parentlock out/$label.json
open -na "Firefox Developer Edition" --args -no-remote -profile $P "http://127.0.0.1:4817/?auto=1&label=$label&$q"
for i in $(seq 1 90); do [ -f out/$label.json ] && break; /bin/sleep 1; done
[ -f out/$label.json ] && python3 -c "
import json;d=json.load(open('out/$label.json'));print('$label', json.dumps(d.get('result'))[:330])" || echo "$label TIMEOUT"
grep -E "priming|ERROR|STALL|cancel" out/$label.live.log | cut -c1-220
