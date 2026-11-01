#!/bin/bash
# step.sh '<maestro commands yaml>': runs one inline flow on the own simulator.
U=2EBB3153-995A-40F8-B2AF-5A71689E3B97
f=$(mktemp /tmp/unify-review-actions-361-web-r5-deno-base-9d05/build/s370c-stack/maestro/stepXXXX.yaml)
printf 'appId: com.anonymous.unifyfrontend\n---\n%s\n' "$1" > $f
maestro --device $U test $f 2>&1 | grep -E "COMPLETED|FAILED|SKIPPED"
rm -f $f
