#!/bin/bash
W=/tmp/unify-review-actions-361-web-r5-deno-base-9d05
cd $W && python3 build/s370c-stack/run_checks.py node build/s370c-stack/native_ops.mjs build/s370c-stack/native-account.json "$@" | tail -1
