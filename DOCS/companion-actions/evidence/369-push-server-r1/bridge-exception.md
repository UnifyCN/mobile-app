# Current startup interval and default bridge exception

`strict_network_ids_unchanged=false`. This record does not alter either historical HOLD report or either approved historical exception. It supplies a separate current interval for root/review disposition.

The preflight at 2026-10-30 18:10:11.975920 UTC records bridge `2dc487fc0e5e157413686e46c0fdceff1e6db18a0d0612f69d2cf273c49e29a1`. Its full protected projection has 33 containers: 32 exited and one created. It has 18 volumes and eight networks. Raw pre-query host/VM tails and their time/hash metadata were saved before the first resource query. Those tails remain in the ignored private directory.

The retained host source records engine start requested at `18:11:03.192563000Z`. It records Resource Saver idle exit at `18:11:03.197465000Z`, after `30m56.017628417s`, triggered by an inspection of the Supabase Kong image. It records daemon ready at `18:11:04.966538000Z`. It records the old bridge being removed from its resource registry at `18:11:05.004300000Z` and the new bridge registered at `18:11:05.004670000Z`.

The new bridge is `05978b887d69221c18b4933006aabe733a939441e5142956fbec94bf95709738`. Docker reports its creation at `18:11:04.726064542Z`. Creation is 1.533501542 seconds after the engine-start request and 0.240473458 seconds before daemon readiness. It falls inside that exact startup interval. No manual engine restart or bridge mutation command ran.

`host-initialization.json` contains exact source paths, line numbers, text, line hashes, and the full retained source-file hash. The full source copy remains private. The selected window includes the automatic start and registry replacement. The VM log rotated during the regression campaign. Its current-start lines were no longer available when the later audit read it. The pre-query VM tail remains. No current VM initialization proof is claimed.

The installed server identifies Engine 29.6.2, commit `3d80467`. `bridge-source.json` records that read and the freshly downloaded official source at that exact commit. The source recreates the default bridge through network configuration when no active sandboxes exist. Host Resource Saver shutdown/start records, the inactive preflight distribution, registry replacement, matching source, and creation time support an automatic-start cause as an inference. This is not a direct internal create/delete trace.

`post-initialization-resources.json` is the first later full projection, captured at its recorded time, not an immediate 18:11 snapshot. `post-initialization-comparison.json` matches all 33 protected IDs, states, and full mount dictionaries, all 18 protected volume names, and all seven nondefault network IDs. The final cleanup comparison must repeat those checks. No continuous inactivity or volume-byte equality is claimed.

The proposed exception covers only this default bridge replacement in this startup interval, under these recorded resource conditions. It covers no custom-network change, running-workload change, later interval, global setting, or historical gap. Root and independent review must assess it. Strict network identity remains false.
