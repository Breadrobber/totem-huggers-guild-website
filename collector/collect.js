// Totem Huggers data collector
// Pulls the guild roster from the Blizzard API, gathers each member's stats,
// and writes them to players.json for the website to display.
//
// Run locally:   node --env-file=.env collector/collect.js
// On GitHub:     runs automatically from .github/workflows/update-stats.yml

const fs = require("fs");
const path = require("path");

// ---------- Settings: change these to match your guild ----------
const REGION = "us";                 // "us" or "eu"
const REALM = "sargeras";     // exactly as it appears in game, e.g. "Area 52"
const GUILD = "not-clan";     // exactly as it appears in game
const MIN_LEVEL = 10;                // skip characters below this level (filters out bank alts)
// ------------------------------------------------------------------

const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
const API = `https://${REGION}.api.blizzard.com`;
const NAMESPACE = `profile-${REGION}`;
const OUTPUT = path.join(__dirname, "..", "players.json");

// The leaderboards shown on the site. "order: asc" means lower is better.
const CATEGORIES = [
  { key: "achievementPoints", label: "Achievement points", order: "desc" },
  { key: "itemLevel",         label: "Item level",         order: "desc" },
  { key: "mounts",            label: "Mounts collected",   order: "desc" },
  { key: "quests",            label: "Quests completed",   order: "desc" },
  { key: "deaths",            label: "Fewest deaths",      order: "asc"  },
];

// Statistic names exactly as Blizzard lists them in the Statistics tab.
const STAT_NAMES = {
  quests: "Quests completed",
  deaths: "Total deaths",
};

const slug = s => s.trim().toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");

async function getToken() {
  const res = await fetch("https://oauth.battle.net/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Login to Blizzard failed (${res.status}). Check your client ID and secret.`);
  return (await res.json()).access_token;
}

async function api(token, urlPath) {
  const sep = urlPath.includes("?") ? "&" : "?";
  const res = await fetch(`${API}${urlPath}${sep}namespace=${NAMESPACE}&locale=en_US`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;               // character hidden or inactive
  if (!res.ok) throw new Error(`${urlPath} returned ${res.status}`);
  return res.json();
}

// Search Blizzard's nested statistics categories for one stat by name
function findStat(statsData, name) {
  if (!statsData) return null;
  const walk = cats => {
    for (const c of cats || []) {
      const hit = (c.statistics || []).find(s => s.name === name);
      if (hit) return hit.quantity;
      const deeper = walk(c.sub_categories);
      if (deeper != null) return deeper;
    }
    return null;
  };
  return walk(statsData.categories);
}

async function collectMember(token, member) {
  const realm = member.character.realm.slug;
  const name = encodeURIComponent(member.character.name.toLowerCase());
  const base = `/profile/wow/character/${realm}/${name}`;

  const [profile, stats, mounts] = await Promise.all([
    api(token, base),
    api(token, `${base}/achievements/statistics`),
    api(token, `${base}/collections/mounts`),
  ]);
  if (!profile) return null;

  return {
    name: profile.name,
    class: profile.character_class?.name ?? "Unknown",
    race: profile.race?.name ?? "",
    stats: {
      level: profile.level,
      achievementPoints: profile.achievement_points ?? null,
      itemLevel: profile.equipped_item_level ?? null,
      mounts: mounts?.mounts?.length ?? null,
      quests: findStat(stats, STAT_NAMES.quests),
      deaths: findStat(stats, STAT_NAMES.deaths),
    },
  };
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET.");
  }
  const token = await getToken();

  const roster = await api(token, `/data/wow/guild/${slug(REALM)}/${slug(GUILD)}/roster`);
  if (!roster) throw new Error(`Guild not found. Check REALM ("${REALM}") and GUILD ("${GUILD}").`);

  const members = roster.members.filter(m => m.character.level >= MIN_LEVEL);
  console.log(`Found ${roster.members.length} members, ${members.length} at level ${MIN_LEVEL}+`);

  // Fetch a few characters at a time to stay well under Blizzard's rate limit
  const players = [];
  for (let i = 0; i < members.length; i += 5) {
    const batch = await Promise.all(members.slice(i, i + 5).map(m =>
      collectMember(token, m).catch(err => { console.warn(`Skipped ${m.character.name}: ${err.message}`); return null; })
    ));
    batch.forEach(p => p && players.push(p));
  }

  const output = {
    guild: roster.guild.name,
    faction: roster.guild.faction?.name ?? "",
    sampleData: false,
    updated: new Date().toISOString().slice(0, 10),
    categories: CATEGORIES,
    players,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`Saved ${players.length} players to players.json`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
