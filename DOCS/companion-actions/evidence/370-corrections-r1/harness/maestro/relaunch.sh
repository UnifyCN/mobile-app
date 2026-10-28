#!/bin/bash
# Fresh app process on the own simulator, one JS load from this worker's Metro.
U=2EBB3153-995A-40F8-B2AF-5A71689E3B97
cd "$(dirname "$0")"
xcrun simctl terminate $U com.anonymous.unifyfrontend 2>/dev/null
sleep 1
xcrun simctl openurl $U "myapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8197"
maestro --device $U test relaunch.yaml 2>&1 | grep -E "FAILED" || echo relaunched
