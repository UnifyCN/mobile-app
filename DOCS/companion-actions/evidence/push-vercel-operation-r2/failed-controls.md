# Preserved failed controls

The first package verification passed Linux and rejected the local macOS cache with runtime_hash_mismatch.
The local worker type check had changed cache/dep_analysis_cache_v2-wal and cache/node_analysis_cache_v2 after preparation.
The local package was prepared again.
Later type checks use separate caches or a copy of the staged Linux cache.
The HTTP cycle always copies its cache to a new temporary directory before execution.
Final package-checks.log records both valid packages and the corrupt-hash and invalid-path rejection controls.

parent-only-failed-control.log records two surviving descendants after the deliberate parent-only kill mutation.
The control killed those processes in its finally block.
This is a detected failing cleanup implementation.
The candidate's complete-group tests pass.

sql-runtime-no-lease.log records 0 passed and 1 failed.
The SQL test stopped at separate_local_SQL_lease_required before creating a connection.
This is a refusal control.
No SQL permission or race test passed in this task.

The initial source lookup found no Mobile worker or Mobile rag-query helper at the required base.
source-pins.json records the exact Web worker source and five helper import files used to add the missing Mobile package.
No Web source changed.
