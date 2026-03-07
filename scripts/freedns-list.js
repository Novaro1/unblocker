// Scrapes all public domains from the FreeDNS shared domain registry.
// Run: node scripts/freedns-list.js
// Output: one domain per line to stdout, progress to stderr
// Save to file: node scripts/freedns-list.js > freedns-domains.txt

import { execFileSync } from "child_process";

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

function extractPublicDomains(html) {
  const domains = [];
  // Each row: <tr class="trl"><td><a href=/subdomain/edit.php?edit_domain_id=29>mooo.com</a>...<td>public</td>
  const rows = html.split(/<tr class="tr[ld]">/i);
  for (const row of rows) {
    const domainMatch = row.match(/edit_domain_id=\d+>([^<]+)<\/a>/i);
    if (domainMatch && /<td>public<\/td>/i.test(row)) {
      domains.push(domainMatch[1].trim().toLowerCase());
    }
  }
  return domains;
}

async function main() {
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
  allDomains.push(...extractPublicDomains(firstPage));

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

    const domains = extractPublicDomains(html);
    allDomains.push(...domains);

    if (page % 25 === 0 || page === totalPages) {
      process.stderr.write(`Page ${page}/${totalPages} — ${allDomains.length} public domains so far\n`);
    }

    // 350ms between requests
    await sleep(350);
  }

  process.stdout.write(allDomains.join("\n") + "\n");
  process.stderr.write(`\nDone. ${allDomains.length} public domains written.\n`);
}

main();
