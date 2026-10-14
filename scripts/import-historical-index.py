"""Build an offline Description index from the CC BY 4.0 Zenodo wiki archive.

Python 3 standard library + curl. The 748 MB source stays in --cache, outside
the repository. A full ZIP is MD5-checked; --central-directory uses HTTP Range
and verifies each selected member's ZIP CRC instead of claiming a full MD5.
"""
import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from difflib import SequenceMatcher
import gzip
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
from urllib.parse import quote
import zipfile
import zlib

SOURCE = "https://doi.org/10.5281/zenodo.11072818"
DOWNLOAD = "https://zenodo.org/records/11072818/files/team_wikis_full_text.zip?download=1"
MD5 = "2e9b1ee2b25138c276fa658c637d01e5"
SIZE, CENTRAL_OFFSET = 747682720, 712034176
# Official /v1/teams/count-by-year snapshot, 2026-10-14. The archive is a subset.
TEAM_COUNTS = dict(zip(range(2008, 2022), [87, 114, 128, 155, 229, 232, 286, 269, 286, 302, 325, 356, 253, 353]))
CHATPARTS = "https://huggingface.co/datasets/shellwork/ChatParts_Dataset"
CHATPARTS_SHA256 = "677b320df718662c1760941e30bed00617a3f8fbd91b05884e1a908a48dfbbc3"
SKIP_TAGS = {"script", "style", "nav", "header", "footer", "noscript", "svg", "button", "select"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
CHROME = re.compile(r"nav|menu|footer|sidebar|(?:^|[\s_-])(?:header|social|sponsors)(?:$|[\s_-])", re.I)
TEMPLATE = (
    "Tell us about your project, describe what moves you",
    "A clear and concise description of your project",
    "What should this page contain?",
    "Advice on writing your Project Description",
)


class BodyText(HTMLParser):
    """Discard explicit navigation and footer containers before matching text."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.chunks = [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        hidden = bool(self.stack and self.stack[-1][1]) or tag in SKIP_TAGS
        hidden |= bool(CHROME.search(f"{attrs.get('id', '')} {attrs.get('class', '')}"))
        hidden |= attrs.get("role") in ("navigation", "contentinfo")
        hidden |= tag == "li" and "onclick" in attrs
        hidden |= attrs.get("id") in ("top_title", "firstHeading", "toc", "catlinks", "mw-panel", "mw-head")
        if tag not in VOID_TAGS:
            self.stack.append((tag, hidden))
        if tag in {"p", "div", "section", "article", "li", "br", "h1", "h2", "h3", "h4"}:
            self.chunks.append("\n")

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if tag in {"p", "div", "section", "article", "li", "h1", "h2", "h3", "h4"}:
            self.chunks.append("\n")

    def handle_data(self, text):
        if not self.stack or not self.stack[-1][1]:
            self.chunks.append(text)


def body_text(html):
    parser = BodyText()
    parser.feed(html)
    text = readable_text("".join(parser.chunks))
    # Unedited official templates describe the competition, not the project.
    if sum(phrase.casefold() in text.casefold() for phrase in TEMPLATE) >= 2:
        return ""
    if "There is currently no text in this page" in text or len(text) < 500:
        return ""
    return text


def readable_text(text):
    # A DOI path such as /ibd/ is not a mention of the topic in the prose.
    text = re.sub(r"https?://\S+|\bdoi:\s*\S+|\b10\.\d{4,9}/\S+", " ", text, flags=re.I)
    return " ".join(text.replace("\ufeff", "").split())


def page_identity(name):
    match = re.fullmatch(r"full_text/(20\d{2})/([^/]+)/(.+)_-_-_CONTENT\.html", name)
    if not match:
        return None
    year, team, page = match.groups()
    segments = page.split("#")
    suffix = [re.sub(r"[\s_-]", "", item).casefold() for item in segments[1:]]
    if suffix not in (["description"], ["projectdescription"], ["project", "description"], ["project", "projectdescription"]):
        return None
    if not segments[0].startswith("Team:"):
        return None
    # The archive encodes MediaWiki slashes as #, and spaces as literal spaces.
    url = f"https://{year}.igem.org/" + quote(page.replace("#", "/").replace(" ", "_"), safe=":/")
    return int(year), team, url


class DirectoryOnly(io.RawIOBase):
    """Present a downloaded ZIP central directory at its original file offset."""
    def __init__(self, data):
        self.data, self.position = data, 0

    def seek(self, offset, whence=0):
        self.position = offset + (self.position if whence == 1 else SIZE if whence == 2 else 0)
        return self.position

    def tell(self):
        return self.position

    def read(self, size=-1):
        if self.position < CENTRAL_OFFSET:
            raise ValueError("Member data must be retrieved with HTTP Range")
        start = self.position - CENTRAL_OFFSET
        data = self.data[start:] if size < 0 else self.data[start:start + size]
        self.position += len(data)
        return data


def range_bytes(start, end, cache):
    target = cache / f"{start}-{end}.bin"
    if target.exists() and target.stat().st_size == end - start + 1:
        return target.read_bytes()
    incoming = target.with_suffix(".incoming")
    result = subprocess.run([
        "curl", "--silent", "--show-error", "--location", "--fail", "--retry", "3",
        "--retry-delay", "5", "--connect-timeout", "15", "--max-time", "60",
        "--range", f"{start}-{end}", DOWNLOAD, "--output", str(incoming),
    ], capture_output=True)
    if result.returncode or not incoming.exists() or incoming.stat().st_size != end - start + 1:
        raise RuntimeError(result.stderr.decode(errors="replace")[:200] or "Incomplete HTTP Range response")
    incoming.replace(target)
    return target.read_bytes()


def remote_member(info, cache, prefix):
    # Read the local header and compressed bytes in one small request.
    start = info.header_offset
    end = min(SIZE - 1, start + 30 + len(info.filename.encode("utf-8")) + info.compress_size + 1023)
    if prefix and end < prefix.stat().st_size:
        with prefix.open("rb") as stream:
            stream.seek(start)
            data = stream.read(end - start + 1)
    else:
        data = range_bytes(start, end, cache)
    header = struct.unpack_from("<4s5H3L2H", data)
    if header[0] != b"PK\x03\x04":
        raise ValueError("Invalid ZIP member header")
    offset = 30 + header[-2] + header[-1]
    if offset + info.compress_size > len(data):
        data = range_bytes(start, start + offset + info.compress_size - 1, cache)
    compressed = data[offset:offset + info.compress_size]
    content = zlib.decompress(compressed, -15) if info.compress_type == 8 else compressed
    if len(content) != info.file_size or zlib.crc32(content) & 0xffffffff != info.CRC:
        raise ValueError("ZIP CRC or length mismatch")
    return content


def chatparts_records(folder, built_at):
    """Use original scraped text, never the archive's generated QA examples.

    The sibling Design/Engineering/Contribution pages identify repeated site
    navigation and footers. Ambiguous pages with remaining menus are omitted.
    Source text can contain encoding artifacts inherited from the 2024 scrape.
    """
    records, totals, rejected = {}, Counter(), Counter()
    for file in sorted((folder / "description").glob("20*_description.txt")):
        year = int(file.name[:4])
        if year not in (2019, 2020, 2021):
            continue
        totals[year] += 1
        raw = " ".join(file.read_text(encoding="utf-8").split())
        identity = re.match(r"Team:([^/]+)/Description\s+-\s+(20\d{2})\.igem\.org", raw)
        if not identity or int(identity[2]) != year:
            rejected[year] += 1
            continue
        team = identity[1].replace(" ", "_")
        start = raw.find(f"Team:{identity[1]}/Description", identity.end())
        start = start + len(f"Team:{identity[1]}/Description") if start >= 0 else identity.end()
        end = len(raw)
        for category in ("design", "engineering", "contribution"):
            other_file = folder / category / file.name.replace("_description.txt", f"_{category}.txt")
            if not other_file.exists():
                continue
            other = " ".join(other_file.read_text(encoding="utf-8").split())
            for a, b, size in common_blocks(raw[:1800], other[:1800]):
                shared = raw[a:a + size]
                menu_words = sum(word in shared for word in ("Human Practices", "Attributions", "Notebook", "Collaborations", "Model", "Parts", "Team", "Home", "Engineering", "Results"))
                if a < 250 and b < 250 and size >= 80 and menu_words >= 2:
                    start = max(start, a + size)
            tail = raw[-1800:]
            for a, b, size in common_blocks(tail, other[-1800:]):
                shared = tail[a:a + size]
                footer_words = re.search(r"Contact|Follow|©|Copyright|Sponsors|About Us|Privacy|All rights|Powered by", shared, re.I)
                if size >= 80 and a + size >= len(tail) - 80 and footer_words:
                    end = min(end, len(raw) - len(tail) + a)
        text = raw[start:end].strip()
        # Reject uncertain leftovers instead of indexing a topic in a site menu.
        if sum(word in text[:450] for word in ("Human Practices", "Attributions", "Notebook", "Collaborations")) >= 3:
            rejected[year] += 1
            continue
        footer = re.search(r"(?:\bFooter\b|\bFollow Us\b|\bContact Us\b|©|All rights reserved)", text[int(len(text) * 0.65):], re.I)
        if footer:
            text = text[:int(len(text) * 0.65) + footer.start()].strip()
        text = readable_text(text)
        if len(text) < 500 or sum(phrase.casefold() in text.casefold() for phrase in TEMPLATE) >= 2:
            rejected[year] += 1
            continue
        identifier = f"{year}/{team}"
        records[identifier] = {"id": identifier, "year": year, "team": team,
            "url": f"https://{year}.igem.org/Team:{quote(team, safe='-_')}/Description",
            "title": "Project Description", "text": text, "source": CHATPARTS,
            "license": "Apache-2.0 (dataset); original wiki content retains its license",
            "fetchedAt": built_at, "sourcePath": f"wiki_data/txt_ori/description/{file.name}"}
    return records, totals, rejected


def common_blocks(left, right):
    # Compare words: character-level matching is needlessly quadratic on spaces.
    a, b = list(re.finditer(r"\S+", left)), list(re.finditer(r"\S+", right))
    for block in SequenceMatcher(None, [m[0] for m in a], [m[0] for m in b], autojunk=False).get_matching_blocks():
        if block.size:
            yield a[block.a].start(), b[block.b].start(), a[block.a + block.size - 1].end() - a[block.a].start()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="Complete source ZIP, verified against its public MD5")
    parser.add_argument("--central-directory", type=Path, help="Bytes 712034176–747682719 of the published ZIP")
    parser.add_argument("--prefix", type=Path, help="Optional partial ZIP starting at byte zero")
    parser.add_argument("--chatparts-directory", type=Path, help="Extracted wiki_data/txt_ori, including description/design/engineering/contribution")
    parser.add_argument("--chatparts-archive", type=Path, help="Original wiki_data.rar; required with --chatparts-directory, SHA256 checked")
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "igem-ping-reference" / "zenodo-members")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "historical-projects.json.gz")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    if args.zip:
        with args.zip.open("rb") as stream:
            if hashlib.file_digest(stream, "md5").hexdigest() != MD5:
                raise ValueError("Source ZIP MD5 mismatch")
        archive = zipfile.ZipFile(args.zip)
        integrity = f"Full ZIP MD5 {MD5}; per-member CRC"
    elif args.central_directory:
        central = args.central_directory.read_bytes()
        if len(central) != SIZE - CENTRAL_OFFSET:
            raise ValueError("Incomplete central directory")
        archive = zipfile.ZipFile(DirectoryOnly(central))
        integrity = "HTTP Range; ZIP CRC checked for every included page; full ZIP MD5 not checked"
    elif args.chatparts_directory:
        archive = None
        integrity = "ChatParts RAR SHA256 checked against its public Hugging Face LFS hash"
    else:
        parser.error("Supply --zip, --central-directory, or --chatparts-directory")
    entries = archive.infolist() if archive else []
    archive_totals = Counter(int(info.filename.split("/")[1]) for info in entries
                             if info.is_dir() and len(info.filename.split("/")) == 4)
    candidates = [(info, page_identity(info.filename)) for info in entries if page_identity(info.filename)]
    print(f"{len(candidates)} explicit Description page candidates", flush=True)
    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    records, errors, rejected = {}, [], Counter()
    if args.chatparts_directory:
        if not args.chatparts_archive:
            parser.error("--chatparts-directory requires --chatparts-archive for integrity verification")
        with args.chatparts_archive.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != CHATPARTS_SHA256:
                raise ValueError("ChatParts source RAR SHA256 mismatch")
        records, extra_totals, rejected = chatparts_records(args.chatparts_directory, built_at)
        archive_totals.update(extra_totals)
        integrity += f"; ChatParts SHA256 {CHATPARTS_SHA256}"
        print(f"ChatParts: {len(records)} historical teams indexed", flush=True)

    def process(item):
        info, (year, team, url) = item
        raw = archive.read(info) if args.zip else remote_member(info, args.cache, args.prefix)
        text = body_text(raw.decode("utf-8", errors="replace"))
        return {"id": f"{year}/{team}", "team": team, "year": year, "url": url,
                "text": text, "title": "Project Description", "fetchedAt": built_at,
                "source": SOURCE, "license": "CC-BY-4.0", "sourcePath": info.filename}

    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
        futures = {pool.submit(process, item): item for item in candidates}
        for number, future in enumerate(as_completed(futures), 1):
            info, identity = futures[future]
            try:
                record = future.result()
                if not record["text"]:
                    rejected[record["year"]] += 1
                elif len(record["text"]) > len(records.get(record["id"], {}).get("text", "")):
                    records[record["id"]] = record
            except Exception as error:
                errors.append({"url": identity[2], "error": str(error)[:200]})
            if number % 100 == 0:
                print(f"{number}/{len(candidates)} pages; {len(records)} teams indexed; {len(errors)} request failures", flush=True)
    counts = Counter(record["year"] for record in records.values())
    coverage = [{"year": year, "total": TEAM_COUNTS[year], "indexed": counts[year],
                 "failed": TEAM_COUNTS[year] - counts[year], "pending": 0,
                 "archiveTotal": archive_totals[year], "source": SOURCE if year <= 2018 else CHATPARTS}
                for year in sorted(archive_totals)]
    result = {"schema": 1, "builtAt": built_at, "source": "Historical Description page archives",
              "licenses": {SOURCE: "CC-BY-4.0", CHATPARTS: "Apache-2.0 (dataset)"}, "integrity": integrity,
              "records": sorted(records.values(), key=lambda record: (record["year"], record["team"])),
              "coverage": coverage, "requestFailures": errors,
              "filteredPageCounts": dict(rejected)}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_bytes(gzip.compress(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0))
    temporary.replace(args.output)
    print(json.dumps({"records": len(records), "coverage": coverage, "errors": len(errors), "output": str(args.output)}, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    assert page_identity("full_text/2018/Test/Team:Test#Project#Description_-_-_CONTENT.html")[2] == "https://2018.igem.org/Team:Test/Project/Description"
    assert page_identity("full_text/2018/Test/Team:Test#Model#Description_-_-_CONTENT.html") is None
    assert body_text("<nav>IBD</nav><p>" + "Actual project findings. " * 30 + "</p><footer>IBD</footer>").count("IBD") == 0
    assert body_text("<p>" + " ".join(TEMPLATE) * 5 + "</p>") == ""
    assert "ibd" not in readable_text("Reference doi:10.1093/ibd/izz119 https://example.org/ibd").lower()
    main()
