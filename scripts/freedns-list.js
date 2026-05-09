// Scrapes domains from the FreeDNS shared domain registry.
// Run: node scripts/freedns-list.js [--all]
//   --all   Include private domains in addition to public ones (default: public only)
// Output: one domain + type per line ("domain\tpublic" or "domain\tprivate"), progress to stderr
// Save to file: node scripts/freedns-list.js --all > freedns-domains.txt

import { execFileSync } from "child_process";

const includePrivate = process.argv.includes("--all");

function fetchPage(page) {
  const html = execFileSync("curl", [
    "-s",
    "-L",
    "--max-time", "15",
    "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.5",
    `https://freedns.afraid.org/domain/registry/?page=${page}`,
  ], { encoding: "utf-8" });
  return html;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractDomains(html) {
  const domains = [];
  // Each row: <tr class="trl"><td><a href=/subdomain/edit.php?edit_domain_id=29>mooo.com</a>...<td>public</td>
  // or <td>private</td>
  const rows = html.split(/<tr class="tr[ld]">/i);
  for (const row of rows) {
    const domainMatch = row.match(/edit_domain_id=\d+>([^<]+)<\/a>/i);
    if (!domainMatch) continue;
    const isPublic  = /<td>public<\/td>/i.test(row);
    const isPrivate = /<td>private<\/td>/i.test(row);
    if (isPublic) {
      domains.push(domainMatch[1].trim().toLowerCase() + "\tpublic");
    } else if (includePrivate && isPrivate) {
      domains.push(domainMatch[1].trim().toLowerCase() + "\tprivate");
    }
  }
  return domains;
}

async function main() {
  process.stderr.write(`Mode: ${includePrivate ? "public + private" : "public only"} (use --all to include private)\n`);

  let firstPage;
  try {
    firstPage = fetchPage(1);
  } catch (err) {
    process.stderr.write(`Error: could not fetch page 1 — is curl installed?\n${err.message}\n`);
    process.exit(1);
  }

  const totalMatch = firstPage.match(/Page \d+ of (\d+)/i);
  const totalPages = totalMatch ? parseInt(totalMatch[1]) : 1;
  process.stderr.write(`FreeDNS registry: ${totalPages} pages to scrape\n`);

  const allDomains = [];
  allDomains.push(...extractDomains(firstPage));

  for (let page = 2; page <= totalPages; page++) {
    let html;
    try {
      html = fetchPage(page);
    } catch {
      process.stderr.write(`Page ${page} failed, retrying in 3s...\n`);
      await sleep(3000);
      try {
        html = fetchPage(page);
      } catch (err2) {
        process.stderr.write(`Page ${page} failed again, skipping: ${err2.message}\n`);
        continue;
      }
    }

    const domains = extractDomains(html);
    allDomains.push(...domains);

    if (page % 25 === 0 || page === totalPages) {
      process.stderr.write(`Page ${page}/${totalPages} — ${allDomains.length} domains so far\n`);
    }

    // 350ms between requests
    await sleep(350);
  }

  const publicCount  = allDomains.filter(l => l.endsWith("\tpublic")).length;
  const privateCount = allDomains.filter(l => l.endsWith("\tprivate")).length;
  process.stdout.write(allDomains.join("\n") + "\n");
  process.stderr.write(`\nDone. ${publicCount} public + ${privateCount} private = ${allDomains.length} domains written.\n`);
}

main();
