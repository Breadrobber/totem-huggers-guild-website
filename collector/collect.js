// Totem Huggers data collector

const fs = require("fs");
const path = require("path");

// ---------- Settings: change these to match your guild ----------
const REGION = "us";                 // "us" or "eu"
const REALM = "sargeras";     // exactly as it appears in game, e.g. "Area 52"
const GUILD = "not-clan";     // exactly as it appears in game, use hyphen for spaces
const MIN_LEVEL = 10;                // min level
// ------------------------------------------------------------------

const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
const API = `https://${REGION}.api.blizzard.com`;
const NAMESPACE = `profile-${REGION}`;
const OUTPUT = path.join(__dirname, "..", "players.json");

// ---------- Leaderboard tabs ----------
// Each line is one tab on the site, in this order.
//   key:    a short unique id, letters only, no spaces
//   label:  the tab's name on the site
//   column: (optional) the column heading, if it should differ from the label
//   order:  "desc" = highest wins, "asc" = lowest wins
//   stat:   the statistic's name EXACTLY as it appears in stats-list.txt
// The first three tabs come from other parts of the API, so they have no "stat".

const CATEGORIES = [
  //{ key: "achievementPoints", label: "Achievement points", order: "desc" },
  { key: "itemLevel",         label: "Item level",         order: "desc" },
  { key: "quests",            label: "Quests completed",   order: "desc", stat: "Quests completed" },
  { key: "lold",              label: "Times LOL'd",        order: "desc", stat: "Total times LOL'd" },
  { key: "cheers",            label: "Total cheers",       order: "desc", stat: "Total cheers" },
  { key: "bgWins",            label: "Battleground wins",  order: "desc", stat: "Battlegrounds won" },
  { key: "falling",           label: "Falling deaths",     order: "desc", stat: "Deaths from falling" },
  { key: "flightPath",        label: "Flight Paths taken", order: "desc", stat: "Flight paths taken" },
  { key: "baronKills",        label: "Baron kills",        order: "desc", stat: "Rivendare kills (Stratholme)" },
  { key: "heroicLKkills",     label: "Lich King kills",    order: "desc", stat: "Victories over the Lich King (Heroic Icecrown 25 player)" },
  { key: "deaths",            label: "Fewest deaths",      order: "asc",  stat: "Total deaths", column: "Deaths" },
  { key: "elixirs",           label: "Elixirs consumed",   order: "desc", stat: "Elixirs consumed" },
  { key: "beverages",         label: "Beverages consumed", order: "desc", stat: "Beverages consumed" },
  { key: "foodEaten",         label: "Food eaten",         order: "desc", stat: "Food eaten" },
  { key: "healthstones",      label: "Healthstones used",  order: "desc", stat: "Healthstones used" },
  { key: "fishCaught",        label: "Fish caught",        order: "desc", stat: "Fish caught" },
  { key: "hearths",           label: "Times hearthed",     order: "desc", stat: "Number of times hearthed" },
  { key: "duelsWon",          label: "Duels won",          order: "desc", stat: "Duels won" },
];
// ----------------------------------------

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

  const [profile, stats, mounts, media] = await Promise.all([
    api(token, base),
    api(token, `${base}/achievements/statistics`),
    api(token, `${base}/collections/mounts`),
    api(token, `${base}/character-media`),
  ]);
  if (!profile) return null;

  const player = {
    name: profile.name,
    class: profile.character_class?.name ?? "Unknown",
    race: profile.race?.name ?? "",
    gender: profile.gender?.type ?? "",
    realm: profile.realm?.slug ?? realm,  // used to build the Armory link
    avatar: media?.assets?.find(a => a.key === "avatar")?.value ?? null,
    stats: {
      level: profile.level,
      achievementPoints: profile.achievement_points ?? null,
      itemLevel: profile.equipped_item_level ?? null,
      mounts: mounts?.mounts?.length ?? null,
    },
  };
  // Fill in every tab that uses a statistic from the Statistics list
  for (const cat of CATEGORIES) {
    if (cat.stat) player.stats[cat.key] = findStat(stats, cat.stat);
  }
  return player;
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

  for (const cat of CATEGORIES) {
    if (cat.stat && !players.some(p => typeof p.stats[cat.key] === "number")) {
      console.warn(`No one had a value for "${cat.stat}". Check the spelling against stats-list.txt.`);
    }
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
