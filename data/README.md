# Project Description index

The app searches `projects.json.gz` locally. This is a partial, dated collection of Project Description **body text**, not a live or exhaustive catalogue. Each record identifies its team, year and original official wiki URL. `coverage.json` records indexed/total teams by year, plus failures from modern collection. The app displays these same counts in **Index coverage**.

The 0.3.0 snapshot contains **3,223 descriptions**: 1,764 from historical archives (2008–2021) and 1,459 from modern official wikis (2022–2025). The literal query `IBD` matches 46 descriptions in this snapshot.

## Sources and attribution

- **2008–2018 archive:** Leo Blondel, Rathin Jeyaram, Abhijeet Krishna and Marc Santolini, *iGEM: a model system for team science and innovation*, version 2, 26 April 2024, [Zenodo DOI 10.5281/zenodo.11072818](https://doi.org/10.5281/zenodo.11072818). The archive is published under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). We extracted only explicit Description HTML pages from `team_wikis_full_text.zip`, removed navigation and other page furniture, normalized whitespace, and deduplicated teams. We did not import participant tables. Earlier teams often used other page names, so early-year coverage is sparse or zero.
- **2019–2021 archive:** [XJTLU-Software 2024, ChatParts](https://2024.igem.wiki/xjtlu-software/software.html), from [shellwork/ChatParts_Dataset](https://huggingface.co/datasets/shellwork/ChatParts_Dataset). The dataset card declares Apache-2.0; a copy is included in [CHATPARTS-LICENSE.txt](CHATPARTS-LICENSE.txt). We use only original `wiki_data/txt_ori/description` texts from `wiki_data.rar`, not generated questions or answers. Shared navigation/footer text was removed using other pages from the same team; empty templates, short pages and entries without a verifiable original URL were excluded. The underlying team wiki content retains its own rights and attribution.
- **2022–2025:** Project Description pages from each team's official `YYYY.igem.wiki` website, located using the [official all-years team directory](https://teams.igem.org/list?year=all) and its public `api.igem.org/v1/teams` and team wiki metadata. Static HTML is parsed first; Microsoft Edge renders JavaScript-only pages when needed. Only explicit Description routes or links are collected. Project abstracts and homepages are never substituted for missing Description pages.

The original prose belongs to its team authors. Record-level source URLs and archive provenance are retained in the index. These texts are **excluded from the application's MIT license**. The source dataset licenses do not grant rights to iGEM trademarks or unrelated third-party material. Original wiki terms and attribution continue to apply. Please use the linked originals for quotation and research.

## Scope and transformations

The snapshot was assembled on 14 October 2026 (Asia/Shanghai); archive texts can reflect substantially earlier captures. `builtAt` and `fetchedAt` record index assembly/retrieval, not a claim that an archived page was updated that day. Current-season 2026 pages are not included. Older unavailable pages cannot be recovered by an empty search result.

The importer removes scripts, navigation, contact details, blank templates, repeated page furniture, and bare URLs/DOIs; readable prose and reference titles can remain. We require substantive body text, deduplicate by year/team, and preserve original language. This automated extraction is conservative but imperfect: unusual layouts can be omitted or retain some page furniture. Archive snapshots and live pages can differ, and an original wiki may later become unavailable.

Keyword search matches all entered terms in this extracted text, case-insensitively. Latin words use word boundaries (`IBD` does not match `ribD`). There is no synonym expansion, translation, topic classifier or generated summary. A matching sentence means that the term occurs in the description; it does not necessarily identify the project's main subject. Queries stay on the user's computer.

Official yearly directory totals include teams whose wikis are missing, unpublished or outside the archive. Consequently, `total - indexed` is not a count of projects unrelated to your query. Historical coverage includes zero-count years so those gaps remain visible.

## Rebuild

The checked-in index works without network access. To refresh modern pages, install development dependencies and run:

```powershell
npm ci
npm run index:build -- --years 2022,2023,2024,2025
npm run index:build -- --years 2022,2023,2024,2025 --render-only
```

The rendering step requires Microsoft Edge. The collector uses bounded concurrency and caches responses under ignored `data/.project-index-cache/`; `--retry-failed` retries failures, and `--concurrency 4` selects four workers. Run only one writer at a time. `--merge-only` merges existing caches with `historical-projects.json.gz` without fetching new pages.

To rebuild historical data, download the cited Zenodo ZIP and ChatParts RAR outside the repository, extract the latter, then use Python 3 and curl:

```powershell
python scripts/import-historical-index.py --zip C:/data/team_wikis_full_text.zip --chatparts-archive C:/data/wiki_data.rar --chatparts-directory C:/data/wiki_data/txt_ori
npm run index:build -- --merge-only
```

The full Zenodo ZIP is checked against its published MD5 `2e9b1ee2b25138c276fa658c637d01e5`. Alternatively, `--central-directory` accepts bytes 712034176–747682719 of that ZIP and downloads selected members with HTTP Range. This release used that method and verified each selected member's ZIP CRC; it does **not** claim to have verified the full ZIP's MD5. The ChatParts RAR was fully verified against the published LFS SHA-256 `677b320df718662c1760941e30bed00617a3f8fbd91b05884e1a908a48dfbbc3`.

The historical importer preserves `sourcePath`, `source`, license and integrity metadata in `historical-projects.json.gz`. Rebuilding only modern pages preserves that historical subset. Inspect coverage and samples before replacing a release snapshot; a successful HTTP response alone is not proof of a usable Description page.

For an incorrect source mapping or a missing project, open a repository issue with the year, team and official Description URL.
