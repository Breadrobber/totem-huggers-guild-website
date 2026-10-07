// Lists every statistic Blizzard has for one character, grouped by category.
// Run from your repo folder:   node --env-file=.env collector/list-stats.js
// Results print on screen and are saved to stats-list.txt (don't commit that file).

const fs = require("fs");

// ---------- Settings: any character in your guild ----------
const REGION = "us";
const REALM = "sargeras";
const CHARACTER = "sadfish";
// -----------------------------------------------------------

const slug = s => s.trim().toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");

async function main() {
  const auth = Buffer.from(`${process.env.BLIZZARD_CLIENT_ID}:${process.env.BLIZZARD_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new Error("Login to Blizzard failed. Check your .env file.");
  const { access_token } = await tokenRes.json();

  const url = `https://${REGION}.api.blizzard.com/profile/wow/character/${slug(REALM)}/` +
    `${encodeURIComponent(CHARACTER.toLowerCase())}/achievements/statistics?namespace=profile-${REGION}&locale=en_US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!res.ok) throw new Error(`Character lookup failed (${res.status}). Check REALM and CHARACTER.`);
  const data = await res.json();

  const lines = [];
  const walk = (cats, path) => {
    for (const c of cats || []) {
      const name = path ? `${path} > ${c.name}` : c.name;
      if (c.statistics?.length) {
        lines.push(`\n== ${name} ==`);
        c.statistics.forEach(s => lines.push(`  ${s.name}: ${s.quantity}`));
      }
      walk(c.sub_categories, name);
    }
  };
  walk(data.categories, "");

  const text = lines.join("\n");
  console.log(text);
  fs.writeFileSync("stats-list.txt", text);
  console.log(`\nSaved ${lines.filter(l => l.startsWith("  ")).length} statistics to stats-list.txt`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
